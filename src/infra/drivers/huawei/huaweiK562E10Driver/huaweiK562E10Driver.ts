import { IDomGateway } from '@/application/ports/IDomGateway';
import { ExtractionFilter } from '@/application/types';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  ExtractionResult,
  ExtractionResultSchema,
  type PingTestResult,
} from '@/domain/schemas/validation';
import { ENDPOINT } from '@/infra/drivers/huawei/huaweiK562E10Driver/contants';
import { HuaweiK562E10Selectors } from '@/infra/drivers/huawei/huaweiK562E10Driver/huaweiK562E10Selectors';
import {
  HUAWEI_WLAN_AUTHENTICATION_MODE_LABELS,
  HUAWEI_WLAN_BANDWIDTH_LABELS,
  HUAWEI_WLAN_ENCRYPTION_MODE_LABELS,
  HUAWEI_WLAN_MODE_LABELS,
} from '@/infra/drivers/huawei/shared/constants';
import { HuaweiBaseDriver } from '@/infra/drivers/huawei/shared/HuaweiBaseDriver';
import {
  escapeRegExp,
  parseHuaweiWlanConfigurationIndex,
} from '@/infra/drivers/huawei/shared/utils';
import { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';

export class HuaweiK562E10Driver extends HuaweiBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('HUAWEI K562E-10', HuaweiK562E10Selectors, topologyParser, domService);
  }

  public async extract(filter?: ExtractionFilter): Promise<ExtractionResult> {
    const extractors: Record<ExtractionFilter[number], () => Promise<Partial<ExtractionResult>>> = {
      opticalSignal: async () => Promise.resolve({ opticalSignal: undefined }),
      topology: function (): Promise<Pick<ExtractionResult, 'topology'>> {
        return Promise.resolve({
          topology: undefined,
        });
      },
      wan: () => this.getWanState(),
      remoteAccess: async () =>
        Promise.resolve({
          remoteAccessIpv4Enabled: undefined,
          remoteAccessIpv6Enabled: undefined,
        }),
      wlan: () => this.getWlanState(),
      lan: () => this.getLanState(),
      upnp: () => this.getUpnpState(),
      tr069: () => this.getTr069State(),
      routerInfo: () => this.getRouterInfoState(),
    };

    const keys = filter?.length ? filter : Object.keys(extractors);
    const data: Partial<ExtractionResult> = {};
    for (const key of keys) {
      const extractor = extractors[key as ExtractionFilter[number]];
      if (!extractor) continue;
      Object.assign(data, await extractor());
    }

    data.timestamp = new Date().toISOString();
    return ExtractionResultSchema.parse(data);
  }

  public buttonElementConfig(): ButtonConfig | null {
    return {
      targetSelector: '#loginWrapper',
      text: 'Run data extraction',
      style: `
        position: absolute;
        bottom: 6.5px;
        left: 27px;
        z-index: 10000;
        padding: 8px;
        color: #181717;
        border: none;
        cursor: pointer;
        background-color: transparent;
      `,
      extLogoStyle: `
        font-size: 9px;
        color: gray;
        margin-left: 4px;
      `,
    };
  }

  public override isAuthenticated(): boolean {
    const indexPage = this.domService.getHTMLElement(this.s.indexPage, HTMLElement);
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && !!indexPage;
  }

  public override async reboot(): Promise<{ success: boolean; message?: string }> {
    return { success: false, message: 'Method not implemented.' };
  }

  /**
   * This model’s admin UI does not reuse the EG8145V5 `diagnosecommon.asp` /
   * `complex.cgi` IPPingDiagnostics path. Returning `null` lets the app show an
   * unsupported / failed ping state instead of calling the wrong endpoints.
   */
  public override async ping(_ip: string): Promise<PingTestResult | null> {
    return null;
  }

  /**
   * WAN summary for the routed Internet PVC — same `WanIP` / `WanPPP` parsing as
   * {@link HuaweiEG8145V5Driver.getWanState}, plus `wan_list_ap.asp` merged in
   * (see `docs/HuaweiK562E10/internetAP.asp` / `getWanDynamicData.asp`). Also loads
   * `tr069.asp` in the same round-trip for `tr069Url` / `tr069Enabled`.
   */
  private async getWanState(): Promise<
    Pick<
      ExtractionResult,
      | 'internetEnabled'
      | 'pppoeUsername'
      | 'ipVersion'
      | 'ipAcquisitionMode'
      | 'requestPdEnabled'
      | 'slaacEnabled'
      | 'dhcpv6Enabled'
      | 'pdEnabled'
      | 'linkSpeed'
      | 'tr069Enabled'
    >
  > {
    const undefinedResult = {
      internetEnabled: undefined,
      pppoeUsername: undefined,
      ipVersion: undefined,
      ipAcquisitionMode: undefined,
      requestPdEnabled: undefined,
      slaacEnabled: undefined,
      dhcpv6Enabled: undefined,
      pdEnabled: undefined,
      linkSpeed: undefined,
      tr069Enabled: undefined,
    };

    const [info, list, listAp, ipv6Ap, tr069Raw] = await Promise.all([
      this.fetch(ENDPOINT.WAN_LIST_INFO),
      this.fetch(ENDPOINT.WAN_LIST),
      this.fetch(ENDPOINT.WAN_LIST_AP),
      this.fetch(ENDPOINT.IPV6_AP),
      this.fetch(ENDPOINT.TR069_AP),
    ]);

    if (!info) return undefinedResult;

    const listCombined = [list, listAp].filter((raw): raw is string => !!raw).join('\n');
    if (!listCombined) return undefinedResult;

    const wanListBuffer = `${info}\n${listCombined}`;

    const wanEntriesRaw: Array<{
      data: Record<string, string>;
      encapMode: 'PPPoE' | 'IPoE';
    }> = [
      ...this.parseHuaweiStructCallAll(wanListBuffer, 'WanPPP').map((data) => ({
        data,
        encapMode: 'PPPoE' as const,
      })),
      ...this.parseHuaweiStructCallAll(wanListBuffer, 'WanIP').map((data) => ({
        data,
        encapMode: 'IPoE' as const,
      })),
    ];

    const seenDomainEncap = new Set<string>();
    const wanEntries = wanEntriesRaw.filter((e) => {
      const key = `${e.encapMode}\t${e.data.domain ?? ''}`;
      if (seenDomainEncap.has(key)) return false;
      seenDomainEncap.add(key);
      return true;
    });

    if (wanEntries.length === 0) return undefinedResult;

    const isInternet = (e: { data: Record<string, string> }) =>
      (e.data.ServiceList ?? '').toUpperCase().includes('INTERNET');
    const isRouted = (e: { data: Record<string, string> }) =>
      (e.data.Mode ?? '').toUpperCase().includes('ROUTED');

    const chosen =
      wanEntries.find((e) => isInternet(e) && isRouted(e)) ??
      wanEntries.find(isInternet) ??
      wanEntries[0];

    const { data, encapMode } = chosen;

    const internetEnabled = data.Enable === '1';

    const pppoeUsername =
      encapMode === 'PPPoE' ? (data.MACAddress ? data.MACAddress : undefined) : undefined;

    // Same `GetProtocolType()` mapping as {@link HuaweiEG8145V5Driver.getWanState}
    // (`IPv4Enable` / `IPv6Enable` on `WanIP` / `WanPPP`). If `wan_list_ap.asp` omits
    // `IPv6Enable`, fall back to the master toggle on `ipv6_ap.asp` (`#ipv6Set`).
    let ipv6On = data.IPv6Enable === '1';
    if (data.IPv6Enable !== '1' && data.IPv6Enable !== '0' && ipv6Ap) {
      const fromIpv6Page = this.parseK562Ipv6MasterToggle(ipv6Ap);
      if (fromIpv6Page !== undefined) ipv6On = fromIpv6Page;
    }
    const ipv4On =
      data.IPv4Enable === '1' || data.IPv4Enable === undefined || data.IPv4Enable === '';
    let ipVersion: string | undefined;
    if (ipv4On && ipv6On) ipVersion = 'IPv4/IPv6';
    else if (ipv4On) ipVersion = 'IPv4';
    else if (ipv6On) ipVersion = 'IPv6';

    const cwmp = this.parseHuaweiCwmp(tr069Raw);
    const tr069Enabled = cwmp ? cwmp.EnableCWMP === '1' : undefined;

    return {
      internetEnabled,
      pppoeUsername,
      ipVersion,
      tr069Enabled,
      // We dont have this informations in this router.
      ipAcquisitionMode: undefined,
      requestPdEnabled: undefined,
      slaacEnabled: undefined,
      dhcpv6Enabled: undefined,
      pdEnabled: undefined,
      linkSpeed: undefined,
    };
  }

  /**
   * Desk AP WLAN: SSID/security from `simplewificfgAP.asp`; radio/channel/advanced UI from
   * `wlanadvanceDestAP.asp` only (this model has no `WlanAdvance.asp?2G|5G` paths).
   */
  private async getWlanState(): Promise<
    Pick<
      ExtractionResult,
      | 'wlan24GhzConfig'
      | 'wlan5GhzConfig'
      | 'wlan24GhzSsids'
      | 'wlan5GhzSsids'
      | 'bandSteeringEnabled'
    >
  > {
    const empty: Pick<
      ExtractionResult,
      | 'wlan24GhzConfig'
      | 'wlan5GhzConfig'
      | 'wlan24GhzSsids'
      | 'wlan5GhzSsids'
      | 'bandSteeringEnabled'
    > = {
      wlan24GhzConfig: undefined,
      wlan5GhzConfig: undefined,
      wlan24GhzSsids: undefined,
      wlan5GhzSsids: undefined,
      bandSteeringEnabled: undefined,
    };

    const [simpleRaw, destAdv] = await Promise.all([
      this.fetch(ENDPOINT.SIMPLE_WIFI_CONFIG_AP),
      this.fetch(ENDPOINT.WLAN_ADVANCE_DEST_AP),
    ]);

    if (!simpleRaw) return empty;

    const wlanRows = this.parseHuaweiStructCallAll(simpleRaw, 'stWlan');
    if (wlanRows.length === 0) return empty;

    const preSharedRows = this.parseHuaweiStructCallAll(simpleRaw, 'stPreSharedKey');

    const advanceForWifi = destAdv ?? '';

    const is2gIndex = (index: number | null): boolean => index != null && index <= 4;
    const is5gIndex = (index: number | null): boolean => index != null && index >= 5;

    type WlanWifiRow = {
      domain?: string;
      index: number | null;
      enabled: string | undefined;
      mode: string | undefined;
      channel: string | undefined;
      transmittingPower: string | undefined;
      bandWidth: string | undefined;
    };

    const wlanWifiRows: WlanWifiRow[] = this.parseHuaweiStructCallAll(
      advanceForWifi,
      'stWlanWifi',
    ).map((row) => {
      const domain = row.domain ?? row.Domain;
      const bandWidth = row.channelWidth ?? row.X_HW_HT20;
      const bandWidthKey =
        bandWidth !== undefined && bandWidth !== null && bandWidth !== ''
          ? String(bandWidth)
          : undefined;
      const bandWidthLabel =
        (bandWidthKey ? HUAWEI_WLAN_BANDWIDTH_LABELS[bandWidthKey] : undefined) ??
        (bandWidthKey === '4' ? 'Auto 20/40/80/160 MHz' : bandWidthKey);

      const mode = row.mode ?? row.X_HW_Standard;
      const modeKey = mode !== undefined && mode !== null && mode !== '' ? String(mode) : undefined;
      const modeLabel =
        (modeKey ? HUAWEI_WLAN_MODE_LABELS[modeKey] : undefined) ??
        (modeKey === '11ax' ? '802.11ax' : modeKey);

      const tpRaw = row.TransmitPower ?? row.power ?? row.transmittingPower;
      const transmittingPower =
        tpRaw !== undefined && tpRaw !== null && tpRaw !== ''
          ? String(tpRaw).endsWith('%')
            ? String(tpRaw)
            : `${tpRaw}%`
          : undefined;
      return {
        domain,
        index: parseHuaweiWlanConfigurationIndex(domain ?? ''),
        enabled: row.enable ?? row.Enable,
        mode: modeLabel,
        channel: row.channel ?? row.Channel,
        transmittingPower,
        bandWidth: bandWidthLabel,
      };
    });

    if (wlanWifiRows.length === 0) {
      const r0 = this.matchHuaweiScriptVar(simpleRaw, 'RadioEnable0');
      const r1 = this.matchHuaweiScriptVar(simpleRaw, 'RadioEnable1');
      const pwr2 = this.matchHuaweiScriptVar(simpleRaw, 'WlanTransmitPower');
      const pwr5 = this.matchHuaweiScriptVar(simpleRaw, 'WlanTransmitPower5g');
      const advChannelRaw = destAdv;

      const pushSynthetic = (
        row: (typeof wlanRows)[0] | undefined,
        radio: string | null,
        pwr: string | null,
        channelSelectId: string,
      ) => {
        if (!row) return;
        const domain = row.domain;
        const idx = parseHuaweiWlanConfigurationIndex(domain ?? '');
        const modeKey = row.X_HW_Standard ?? '';
        const bwKey = row.X_HW_HT20 ?? '';
        const modeLabel =
          HUAWEI_WLAN_MODE_LABELS[modeKey] ?? (modeKey === '11ax' ? '802.11ax' : modeKey);
        const bwLabel =
          HUAWEI_WLAN_BANDWIDTH_LABELS[bwKey] ?? (bwKey === '4' ? 'Auto 20/40/80/160 MHz' : bwKey);
        wlanWifiRows.push({
          domain,
          index: idx,
          enabled: radio === '1' ? '1' : '0',
          mode: modeLabel,
          channel: this.matchHuaweiSelectValueById(advChannelRaw, channelSelectId) ?? undefined,
          transmittingPower: pwr ? `${pwr}%` : undefined,
          bandWidth: bwLabel,
        });
      };

      const row2g = wlanRows.find((r) =>
        is2gIndex(parseHuaweiWlanConfigurationIndex(r.domain ?? '')),
      );
      const row5g = wlanRows.find((r) =>
        is5gIndex(parseHuaweiWlanConfigurationIndex(r.domain ?? '')),
      );
      pushSynthetic(row2g, r0, pwr2, 'Channel');
      pushSynthetic(row5g, r1, pwr5, 'Channel5g');
    }

    let bandSteeringEnabled = this.extractHuaweiBandSteeringEnabledFromWlanAdvance5g(destAdv);
    if (bandSteeringEnabled === undefined) {
      const isSplit = this.matchHuaweiScriptVar(simpleRaw, 'IsSplit');
      const row2g = wlanRows.find((r) =>
        is2gIndex(parseHuaweiWlanConfigurationIndex(r.domain ?? '')),
      );
      const row5g = wlanRows.find((r) =>
        is5gIndex(parseHuaweiWlanConfigurationIndex(r.domain ?? '')),
      );
      const sameSsid = (row2g?.ssid ?? '').trim() === (row5g?.ssid ?? '').trim();
      if (isSplit === '1') bandSteeringEnabled = false;
      else if (isSplit === '0') bandSteeringEnabled = sameSsid ? true : false;
    }

    const findBandConfig = (isBandIndex: (idx: number | null) => boolean) => {
      const row = wlanWifiRows.find((item) => isBandIndex(item.index));
      if (!row) return undefined;
      console.log('row', row);
      const modeLabel = row.mode ? HUAWEI_WLAN_MODE_LABELS[row.mode] : undefined;
      let bandWidthLabel = row.bandWidth
        ? row.bandWidth.startsWith('Auto')
          ? 'Auto'
          : row.bandWidth
        : undefined;
      return {
        enabled: row.enabled === '1',
        channel: row.channel || undefined,
        mode: modeLabel,
        bandWidth: bandWidthLabel,
        transmittingPower: row.transmittingPower || undefined,
      };
    };

    const buildSsids = (isBandIndex: (idx: number | null) => boolean) => {
      const bandRows = wlanRows.filter((row) =>
        isBandIndex(parseHuaweiWlanConfigurationIndex(row.domain ?? '')),
      );
      if (!bandRows.length) return undefined;
      console.log('bandRows', bandRows);
      return bandRows.map((row) => {
        const keyRow = preSharedRows.find((key) => key.domain?.includes(row.domain ?? ''));
        const password = keyRow?.psk || keyRow?.kpp || undefined;
        const maxClients = Number.parseInt(row.X_HW_AssociateNum ?? '', 10);
        const authenticationMode = row.BeaconType;
        const encryptionMode = row.X_HW_WPAand11iEncryptionModes;
        const authModeLabel = authenticationMode
          ? HUAWEI_WLAN_AUTHENTICATION_MODE_LABELS[authenticationMode]
          : undefined;
        const encryptModeLabel = encryptionMode
          ? HUAWEI_WLAN_ENCRYPTION_MODE_LABELS[encryptionMode]
          : undefined;
        return {
          enabled: row.Enable === '1',
          ssidName: row.ssid?.trim() || undefined,
          ssidPassword: password,
          ssidHideMode: row.SSIDAdvertisementEnabled === '0',
          wpa2SecurityType:
            [authModeLabel, encryptModeLabel].filter(Boolean).join('-') || undefined,
          maxClients: Number.isNaN(maxClients) ? undefined : maxClients,
        };
      });
    };

    return {
      wlan24GhzConfig: findBandConfig(is2gIndex),
      wlan5GhzConfig: findBandConfig(is5gIndex),
      wlan24GhzSsids: buildSsids(is2gIndex),
      wlan5GhzSsids: buildSsids(is5gIndex),
      bandSteeringEnabled,
    };
  }

  /** Selected `<option>` on a Huawei `<select id="…">` (current channel, etc.). */
  private matchHuaweiSelectValueById(raw: string | null, id: string): string | null {
    if (!raw) return null;
    const escapedId = escapeRegExp(id);
    const m = new RegExp(
      `<select\\b[^>]*\\bid=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/select>`,
      'i',
    ).exec(raw);
    if (!m) return null;
    const selected = /<option\b[^>]*\bselected\b[^>]*\bvalue=["']([^"']*)["']/i.exec(m[1]);
    if (selected) return this.unescapeHuaweiHex(selected[1]);
    return null;
  }

  /**
   * `upnp_ap.asp` sets `enblMainUpnp` / `enblSlvUpnp`; the UI treats UPnP as on when
   * both are `1` (see `LoadFrame` in `docs/HuaweiK562E10/upnp_ap.asp`).
   */
  private async getUpnpState(): Promise<Pick<ExtractionResult, 'upnpEnabled'>> {
    const raw = await this.fetch(ENDPOINT.UPNP_AP);
    if (!raw) return { upnpEnabled: undefined };
    const main = this.matchHuaweiScriptVar(raw, 'enblMainUpnp');
    const slave = this.matchHuaweiScriptVar(raw, 'enblSlvUpnp');
    if (main == null || slave == null) return { upnpEnabled: undefined };
    return { upnpEnabled: main === '1' && slave === '1' };
  }

  /**
   * `tr069.asp` embeds `new stCWMP(...)` with `EnableCWMP` / `URL` — same shape as
   * {@link HuaweiEG8145V5Driver.getTr069State} but under `html/ssmp/tr069/tr069.asp`.
   */
  private async getTr069State(): Promise<Pick<ExtractionResult, 'tr069Url'>> {
    const raw = await this.fetch(ENDPOINT.TR069_AP);
    const cwmp = this.parseHuaweiCwmp(raw);
    if (!cwmp) return { tr069Url: undefined };
    return {
      tr069Url: cwmp.URL ? cwmp.URL : undefined,
    };
  }

  /**
   * `deviceinfo_ap.asp` embeds `new stDeviceInfo(...)` with `ModelName` and
   * `SoftwareVersion` (see `docs/HuaweiK562E10/deviceinfo_ap.asp`). Same fallback
   * as {@link HuaweiEG8145V5Driver.getRouterInfoState} when cells are pre-filled in HTML.
   */
  private async getRouterInfoState(): Promise<
    Pick<ExtractionResult, 'routerModel' | 'routerVersion'>
  > {
    const raw = await this.fetch(ENDPOINT.DEVICE_INFO_AP);
    if (!raw) return { routerModel: undefined, routerVersion: undefined };
    const fromJs = this.parseHuaweiStructCall(raw, 'stDeviceInfo');
    const routerModel =
      (fromJs?.ModelName?.trim() || this.matchHuaweiTdTextById(raw, 'td1_2')) ?? undefined;
    const routerVersion =
      (fromJs?.SoftwareVersion?.trim() || this.matchHuaweiTdTextById(raw, 'td5_2')) ?? undefined;
    return { routerModel, routerVersion };
  }

  /**
   * `landhcp_ap.asp` exposes only the primary DHCP pool and LAN IP details on
   * this model. Relay, subnet mask, and DNS fields are not available here.
   */
  private async getLanState(): Promise<
    Pick<
      ExtractionResult,
      | 'dhcpEnabled'
      | 'dhcpRelayStatus'
      | 'dhcpIpAddress'
      | 'dhcpSubnetMask'
      | 'dhcpStartIp'
      | 'dhcpEndIp'
      | 'dhcpPrimaryDns'
      | 'dhcpSecondaryDns'
      | 'dhcpLeaseTimeMode'
      | 'dhcpLeaseTime'
    >
  > {
    const undefinedResult = {
      dhcpEnabled: undefined,
      dhcpRelayStatus: undefined,
      dhcpIpAddress: undefined,
      dhcpSubnetMask: undefined,
      dhcpStartIp: undefined,
      dhcpEndIp: undefined,
      dhcpPrimaryDns: undefined,
      dhcpSecondaryDns: undefined,
      dhcpLeaseTimeMode: undefined,
      dhcpLeaseTime: undefined,
    };

    const raw = await this.fetch(ENDPOINT.LAN_DHCP_AP);
    if (!raw) return undefinedResult;

    const dhcpMain = this.parseHuaweiStructCall(raw, 'dhcpmainst1');
    const lanHostInfo = this.parseHuaweiStructCallAll(raw, 'stLanHostInfo').find((row) =>
      row.domain?.includes('.IPInterface.1'),
    );

    if (!dhcpMain && !lanHostInfo) return undefinedResult;

    return {
      dhcpEnabled: dhcpMain ? dhcpMain.enable === '1' : undefined,
      dhcpRelayStatus: undefined,
      dhcpIpAddress: lanHostInfo?.ipaddr?.trim() || undefined,
      dhcpSubnetMask: undefined,
      dhcpStartIp: dhcpMain?.startip?.trim() || undefined,
      dhcpEndIp: dhcpMain?.endip?.trim() || undefined,
      dhcpPrimaryDns: undefined,
      dhcpSecondaryDns: undefined,
      dhcpLeaseTimeMode: undefined,
      dhcpLeaseTime: dhcpMain?.leasetime?.trim() || undefined,
    };
  }

  /** `ipv6_ap.asp` — `#ipv6Set` `dhcpserverflag` / `DHCPServerFlag` reflects any WAN IPv6 on. */
  private parseK562Ipv6MasterToggle(raw: string): boolean | undefined {
    const block = /<[^>]*\bid\s*=\s*["']ipv6Set["'][^>]*>/i.exec(raw)?.[0];
    if (!block) return undefined;
    const m =
      /\bdhcpserverflag\s*=\s*["']([01])["']/i.exec(block) ??
      /\bDHCPServerFlag\s*=\s*["']([01])["']/i.exec(block);
    if (!m) return undefined;
    return m[1] === '1';
  }

  private async fetch(path: string): Promise<string | null> {
    try {
      const response = await fetch(path, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }
}
