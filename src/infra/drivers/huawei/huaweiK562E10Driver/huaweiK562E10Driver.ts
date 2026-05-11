import { IDomGateway } from '@/application/ports/IDomGateway';
import { ExtractionFilter } from '@/application/types';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  ExtractionResult,
  ExtractionResultSchema,
  PingTestResultSchema,
  type PingTestResult,
} from '@/domain/schemas/validation';
import {
  HUAWEI_COLON_MAC,
  HUAWEI_PING_DEFAULT_DATA_BLOCK_SIZE,
  HUAWEI_PING_DEFAULT_DSCP,
  HUAWEI_PING_DEFAULT_REPETITIONS,
  HUAWEI_PING_DEFAULT_TIMEOUT_MS,
  HUAWEI_PING_HEADER_LINE,
  HUAWEI_PING_POLL_GRACE_MS,
  HUAWEI_PING_POLL_INTERVAL_MS,
  HUAWEI_PING_REPLY_LINE,
  HUAWEI_PING_RESULT_DELIMITER,
  HUAWEI_PING_RTT_LINE,
  HUAWEI_PING_STATS_LINE,
} from '@/infra/drivers/huawei/HuaweiEG8145V5Driver/constants';
import {
  decodeJsEscape,
  fetchWithMethod,
  isPrivateOrLocalIPv4,
  normalizeMac,
  parseUserDeviceRowsPositional,
  resolveWifiBandForUserDevice,
  tryReadHuaweiCsrfTokenFromDocument,
} from '@/infra/drivers/huawei/HuaweiEG8145V5Driver/utils';
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
import type { TopologyClient } from '@/infra/drivers/shared/types';

export class HuaweiK562E10Driver extends HuaweiBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('HUAWEI K562E-10', HuaweiK562E10Selectors, topologyParser, domService);
  }

  public async extract(filter?: ExtractionFilter): Promise<ExtractionResult> {
    const extractors: Record<ExtractionFilter[number], () => Promise<Partial<ExtractionResult>>> = {
      opticalSignal: async () => Promise.resolve({ opticalSignal: undefined }),
      topology: () => this.getTopologyState(),
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

  /**
   * Reboot via TR-069 `InternetGatewayDevice.X_HW_DEBUG.SMP.DM.ResetBoard`, matching
   * the stock UI (`docs/HuaweiK562E10/index.asp` `onReboot()`):
   *
   *     POST /set.cgi?x=…ResetBoard
   *     x.X_HW_Token=<onttoken>
   *
   * Same CSRF / iframe constraints as {@link HuaweiEG8145V5Driver.reboot}:
   * fetch a fresh `#hwonttoken` from `index.asp` immediately before the POST;
   * submit through {@link submitCgiForm} so the request uses a real navigation
   * where required. After accept, the device often tears the connection down
   * mid-response — a normal outcome; we do not require a body from `submitCgiForm`.
   */
  public override async reboot(): Promise<{ success: boolean; message?: string }> {
    const token = await this.fetchHuaweiCsrfToken(ENDPOINT.INDEX);
    if (!token) {
      return {
        success: false,
        message: 'Missing onttoken on index.asp (session expired or device unreachable)',
      };
    }

    await this.submitCgiForm(ENDPOINT.RESET_BOARD, {
      'x.X_HW_Token': token,
    });

    return { success: true };
  }

  /**
   * Same TR-069 `InternetGatewayDevice.IPPingDiagnostics` flow as
   * {@link HuaweiEG8145V5Driver.ping}: POST `complex.cgi` (see
   * `docs/HuaweiK562E10/diagnosecommon.asp` `OnApply` / `OnStopPing`), poll
   * `GetPingResult.asp`, parse BusyBox-style output. WAN binding for public
   * targets merges `wan_list_ap.asp` into the WAN list (same idea as
   * {@link getWanState}) so routed INTERNET PVC `domain` is found when rows
   * only appear on the AP script.
   */
  public override async ping(ip: string): Promise<PingTestResult | null> {
    const params: Record<string, string> = {
      'x.Host': ip,
      'x.DiagnosticsState': 'Requested',
      'x.NumberOfRepetitions': String(HUAWEI_PING_DEFAULT_REPETITIONS),
      'x.DSCP': String(HUAWEI_PING_DEFAULT_DSCP),
      'x.DataBlockSize': String(HUAWEI_PING_DEFAULT_DATA_BLOCK_SIZE),
      'x.Timeout': String(HUAWEI_PING_DEFAULT_TIMEOUT_MS),
    };

    if (!isPrivateOrLocalIPv4(ip)) {
      const wanDomain = await this.findInternetWanDomainForPing();
      if (wanDomain) params['x.Interface'] = wanDomain;
    }

    params['RUNSTATE_FLAG.value'] = 'START';

    const token = await this.fetchDiagnosePageCsrfToken();
    if (!token) return null;
    params['x.X_HW_Token'] = token;

    const started = await this.submitCgiForm(ENDPOINT.PING_DIAGNOSE, params);
    if (started == null) return null;

    const newState = this.parseHuaweiStructCall(started, 'PingResultClass');
    if (!newState || (newState.Host ?? '') !== ip) return null;

    const tokenAfterStart = this.matchInputValueById(started, 'hwonttoken') ?? token;

    const deadline =
      Date.now() +
      HUAWEI_PING_DEFAULT_REPETITIONS * HUAWEI_PING_DEFAULT_TIMEOUT_MS +
      HUAWEI_PING_POLL_GRACE_MS;

    let raw = '';
    let status = 'Requested';

    while (Date.now() < deadline) {
      await this.delay(HUAWEI_PING_POLL_INTERVAL_MS);
      const polled = await this.pollPingResult();
      if (!polled) continue;
      raw = polled.raw;
      status = polled.status;
      if (status !== 'Requested') break;
    }

    if (status === 'Requested') {
      const stopParams: Record<string, string> = {
        'x.Host': ip,
        'RUNSTATE_FLAG.value': 'TERMIANL',
        'x.X_HW_Token': tokenAfterStart,
      };
      await this.submitCgiForm(ENDPOINT.PING_DIAGNOSE, stopParams);
    }

    if (!raw) return null;
    return this.parseBusyBoxPingOutput(raw, ip);
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

    const [simpleRaw, destAdv, destAdvApi, advComApi, wlanListRaw] = await Promise.all([
      this.fetch(ENDPOINT.SIMPLE_WIFI_CONFIG_AP),
      this.fetch(ENDPOINT.WLAN_ADVANCE_DEST_AP),
      this.fetch(ENDPOINT.WLAN_ADVANCE_DEST_AP_API),
      this.fetch(ENDPOINT.WLAN_ADVANCE_COM_API),
      this.fetch(ENDPOINT.WLAN_LIST_AP),
    ]);

    if (!simpleRaw) return empty;

    const wlanRows = this.parseHuaweiStructCallAll(simpleRaw, 'stWlan');
    if (wlanRows.length === 0) return empty;

    const preSharedRows = this.parseHuaweiStructCallAll(simpleRaw, 'stPreSharedKey');

    const advanceForWifi = [destAdv, destAdvApi, advComApi, wlanListRaw]
      .filter((raw): raw is string => !!raw)
      .join('\n');
    const channelRaw = [advanceForWifi, simpleRaw].filter(Boolean).join('\n');

    const is2gIndex = (index: number | null): boolean => index != null && index <= 4;
    const is5gIndex = (index: number | null): boolean => index != null && index >= 5;
    const live2gChannel = this.readHuaweiSelectValueFromDom('#Channel');
    const live5gChannel = this.readHuaweiSelectValueFromDom('#Channel5g');

    type WlanWifiRow = {
      domain?: string;
      index: number | null;
      enabled: string | undefined;
      mode: string | undefined;
      channel: string | undefined;
      transmittingPower: string | undefined;
      bandWidth: string | undefined;
    };

    const wlanWifiRows: WlanWifiRow[] = this.parseHuaweiStructCallAllLoose(
      advanceForWifi,
      'stWlanWifi',
    ).map((row) => {
      const domain = row.domain ?? row.Domain;
      const index = parseHuaweiWlanConfigurationIndex(domain ?? '');
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
        index,
        enabled: row.enable ?? row.Enable,
        mode: modeLabel,
        channel:
          (is5gIndex(index) ? live5gChannel : live2gChannel) ??
          this.extractHuaweiWlanChannel(row, index, channelRaw),
        transmittingPower,
        bandWidth: bandWidthLabel,
      };
    });

    if (wlanWifiRows.length === 0) {
      const r0 = this.matchHuaweiScriptVar(simpleRaw, 'RadioEnable0');
      const r1 = this.matchHuaweiScriptVar(simpleRaw, 'RadioEnable1');
      const pwr2 = this.matchHuaweiScriptVar(simpleRaw, 'WlanTransmitPower');
      const pwr5 = this.matchHuaweiScriptVar(simpleRaw, 'WlanTransmitPower5g');

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
          channel:
            (channelSelectId === 'Channel5g' ? live5gChannel : live2gChannel) ??
            this.extractHuaweiWlanChannel(row, idx, channelRaw, channelSelectId),
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
      const bandWidthLabel = row.bandWidth
        ? row.bandWidth.startsWith('Auto')
          ? 'Auto'
          : row.bandWidth
        : undefined;
      return {
        enabled: row.enabled === '1',
        channel: row.channel || undefined,
        mode: row.mode || undefined,
        bandWidth: bandWidthLabel,
        transmittingPower: row.transmittingPower || undefined,
      };
    };

    const buildSsids = (isBandIndex: (idx: number | null) => boolean) => {
      const bandRows = wlanRows.filter((row) =>
        isBandIndex(parseHuaweiWlanConfigurationIndex(row.domain ?? '')),
      );
      if (!bandRows.length) return undefined;
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
    const selectedOption = m[1].match(/<option\b[^>]*\bselected\b[^>]*>/i)?.[0];
    const value = selectedOption?.match(/\bvalue=["']([^"']*)["']/i)?.[1];
    if (value !== undefined) return this.unescapeHuaweiHex(value);
    return null;
  }

  private readHuaweiSelectValueFromDom(selector: string): string | undefined {
    const value =
      this.domService.getElementValue(selector)?.trim() ??
      this.readHuaweiSelectValueFromDocument(document, selector);
    if (!value) return undefined;
    return this.normalizeHuaweiChannelValue(value);
  }

  private readHuaweiSelectValueFromDocument(doc: Document, selector: string): string | undefined {
    const select = doc.querySelector(selector);
    if (select instanceof HTMLSelectElement && select.value.trim()) return select.value.trim();

    for (const frame of Array.from(doc.querySelectorAll('iframe'))) {
      try {
        const frameDoc = frame.contentDocument;
        if (!frameDoc) continue;
        const value = this.readHuaweiSelectValueFromDocument(frameDoc, selector);
        if (value) return value;
      } catch {
        // Ignore cross-origin frames; router pages are same-origin when accessible.
      }
    }

    return undefined;
  }

  private extractHuaweiWlanChannel(
    row: Record<string, string>,
    index: number | null,
    raw: string | null,
    preferredSelectId?: string,
  ): string | undefined {
    const fromRow = this.firstHuaweiRowValue(row, [
      'channel',
      'Channel',
      'wlanChannel',
      'WlanChannel',
      'WLANChannel',
      'currentChannel',
      'CurrentChannel',
      'channelNumber',
      'ChannelNumber',
      'X_HW_Channel',
    ]);
    if (fromRow) return this.normalizeHuaweiChannelValue(fromRow);

    const is5g = index != null && index >= 5;
    const selectIds = preferredSelectId
      ? [preferredSelectId]
      : is5g
        ? ['Channel5g', 'WlanChannel5g', 'Wlan5gChannel', 'Channel_5G']
        : ['Channel', 'Channel2g', 'WlanChannel', 'WlanChannel2g', 'Wlan2gChannel', 'Channel_2G'];

    for (const id of selectIds) {
      const fromSelect =
        this.matchHuaweiSelectValueById(raw, id) ??
        this.matchHuaweiElementValueAssignmentById(raw, id) ??
        this.matchHuaweiSelectHelperValue(raw, id);
      if (fromSelect) return this.normalizeHuaweiChannelValue(fromSelect);
    }

    const scriptVars = is5g
      ? ['Channel5g', 'WlanChannel5g', 'Wlan5gChannel', 'CurrentChannel5g']
      : ['Channel', 'Channel2g', 'WlanChannel', 'WlanChannel2g', 'CurrentChannel'];
    for (const name of scriptVars) {
      const value = this.matchHuaweiScriptVar(raw, name);
      if (value) return this.normalizeHuaweiChannelValue(value);
    }

    return undefined;
  }

  private normalizeHuaweiChannelValue(value: string): string {
    const trimmed = value.trim();
    if (trimmed === '0' || trimmed === '-1') return 'Auto';
    return trimmed;
  }

  private firstHuaweiRowValue(row: Record<string, string>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = row[key]?.trim();
      if (value) return value;
    }
    return undefined;
  }

  private matchHuaweiElementValueAssignmentById(raw: string | null, id: string): string | null {
    if (!raw) return null;
    const escapedId = escapeRegExp(id);
    const elementExpr = String.raw`(?:document\.getElementById\(["']${escapedId}["']\)|getElement\(["']${escapedId}["']\)|getElById\(["']${escapedId}["']\)|\$\(["']${escapedId}["']\))`;
    const direct = new RegExp(
      `${elementExpr}\\s*\\.value\\s*=\\s*(["'])([\\s\\S]*?)\\1`,
      'i',
    ).exec(raw);
    if (direct) return this.unescapeHuaweiHex(direct[2]);

    const expression = new RegExp(`${elementExpr}\\s*\\.value\\s*=\\s*([^;\n\r]+)`, 'i').exec(
      raw,
    )?.[1];
    return expression ? this.resolveHuaweiJsValueExpression(raw, expression) : null;
  }

  private matchHuaweiSelectHelperValue(raw: string | null, id: string): string | null {
    if (!raw) return null;
    const escapedId = escapeRegExp(id);
    const helperCall = new RegExp(
      String.raw`\b(?:setSelect|setSelectValue|setSelectVal|SelectSet)\s*\(\s*["']${escapedId}["']\s*,\s*([^)]+?)\s*\)`,
      'i',
    ).exec(raw);
    if (!helperCall) return null;

    return this.resolveHuaweiJsValueExpression(raw, helperCall[1]);
  }

  private resolveHuaweiJsValueExpression(raw: string | null, expression: string): string | null {
    if (!raw) return null;
    const value = expression.trim();

    const literal = /^["']([\s\S]*?)["']$/.exec(value);
    if (literal) return this.unescapeHuaweiHex(literal[1]);
    if (/^-?\d+$/.test(value)) return value;

    const variable = /^[A-Za-z_$][\w$]*$/.exec(value)?.[0];
    if (variable) return this.matchHuaweiScriptVar(raw, variable);

    const property = /^([A-Za-z_$][\w$]*)(?:\[\d+\])?\.([A-Za-z_$][\w$]*)$/.exec(value);
    if (property) return this.matchHuaweiObjectProperty(raw, property[1], property[2]);

    return null;
  }

  private matchHuaweiObjectProperty(
    raw: string | null,
    objectName: string,
    propertyName: string,
  ): string | null {
    if (!raw) return null;
    const obj = escapeRegExp(objectName);
    const prop = escapeRegExp(propertyName);
    const assignment = new RegExp(
      String.raw`\b${obj}\.${prop}\s*=\s*(?:(["'])([\s\S]*?)\1|([^;\n\r]+))`,
      'i',
    ).exec(raw);
    if (!assignment) return null;

    const quoted = assignment[2];
    if (quoted !== undefined) return this.unescapeHuaweiHex(quoted);

    const bare = assignment[3]?.trim();
    if (!bare) return null;
    if (/^-?\d+$/.test(bare)) return bare;
    return this.matchHuaweiScriptVar(raw, bare);
  }

  /**
   * Some K562E10 WLAN constructors mix quoted strings and bare numeric args. The
   * shared Huawei parser intentionally reads quoted literals only, which drops
   * unquoted channel values and shifts later fields.
   */
  private parseHuaweiStructCallAllLoose(
    raw: string | null,
    structName: string,
  ): Record<string, string>[] {
    if (!raw) return [];
    const escaped = escapeRegExp(structName);
    const sig = new RegExp(`function\\s+${escaped}\\s*\\(([\\s\\S]*?)\\)`).exec(raw);
    if (!sig) return [];

    const params = sig[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (!params.length) return [];

    const callRegex = new RegExp(`new\\s+${escaped}\\s*\\(([\\s\\S]*?)\\)`, 'g');
    const records: Record<string, string>[] = [];
    for (const match of raw.matchAll(callRegex)) {
      const values = this.parseHuaweiConstructorArgsLoose(match[1]);
      if (!values.length) continue;

      const record: Record<string, string> = {};
      const len = Math.min(params.length, values.length);
      for (let i = 0; i < len; i++) record[params[i]] = values[i];
      records.push(record);
    }
    return records;
  }

  private parseHuaweiConstructorArgsLoose(args: string): string[] {
    const values: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let escaped = false;

    const push = () => {
      const value = current.trim();
      values.push(this.unescapeHuaweiHex(value));
      current = '';
    };

    for (const ch of args) {
      if (escaped) {
        current += `\\${ch}`;
        escaped = false;
        continue;
      }

      if (ch === '\\' && quote) {
        escaped = true;
        continue;
      }

      if (quote) {
        if (ch === quote) quote = null;
        else current += ch;
        continue;
      }

      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }

      if (ch === ',') {
        push();
        continue;
      }

      current += ch;
    }

    push();
    return values;
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

  /**
   * `userdevinfosmart.asp` loads clients via the same `GetLanUserDevInfo.asp` POST
   * path as {@link HuaweiEG8145V5Driver.getTopologyState}. The smart page also embeds
   * `staInfo` JSON (`station_mac` + `link` `2.4G` / `5G`) used here when
   * `stWifiWorkingMode` is absent from the ASP bundle.
   */
  private async getTopologyState(): Promise<Pick<ExtractionResult, 'topology'>> {
    const smartRaw = await this.fetch(ENDPOINT.USER_DEVICE_INFO_SMART);
    const token =
      tryReadHuaweiCsrfTokenFromDocument() ?? this.parseK562TokenFromSmartPage(smartRaw);
    const [devInfo, dhcpInfo, lanUserInfo] = await Promise.all([
      this.fetchLanUserAsp(ENDPOINT.GET_LAN_USER_DEV_INFO, token),
      this.fetchLanUserAsp(ENDPOINT.GET_LAN_USER_DHCP_INFO, token),
      this.fetchLanUserAsp(ENDPOINT.LAN_USER_INFO, token),
    ]);
    const raw = [devInfo, dhcpInfo, lanUserInfo].filter((s): s is string => !!s).join('\n');
    if (!raw) return { topology: undefined };

    const staBandByMac = this.parseStaInfoWifiBandMap(smartRaw);
    const topology = this.parseTopologyFromLanUserBundle(raw, staBandByMac);
    return { topology: topology ?? undefined };
  }

  /** Prefer POST with `x.X_HW_Token` (matches `userdevinfosmart.asp` jQuery calls). */
  private async fetchLanUserAsp(path: string, csrfToken: string | null): Promise<string | null> {
    const postBody = csrfToken ? `x.X_HW_Token=${encodeURIComponent(csrfToken)}` : '';
    const post = await fetchWithMethod(path, 'POST', postBody);
    if (post && /new\s+USERDevice\s*\(/i.test(post)) return post;
    const get = await fetchWithMethod(path, 'GET');
    if (get && /new\s+USERDevice\s*\(/i.test(get)) return get;
    return post ?? get;
  }

  /** `userdevinfosmart.asp` embeds `var token = '…'` for `x.X_HW_Token` POST bodies. */
  private parseK562TokenFromSmartPage(raw: string | null): string | null {
    if (!raw) return null;
    const m = /var\s+token\s*=\s*'((?:\\.|[^'\\])*)'\s*;/i.exec(raw);
    if (!m) return null;
    const decoded = m[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    return decoded.trim() || null;
  }

  /**
   * Parses `staInfo` / mesh JSON embedded in `userdevinfosmart.asp` (see
   * `station_mac` + `link` fields in the doc example).
   */
  private parseStaInfoWifiBandMap(raw: string | null): Map<string, '24ghz' | '5ghz'> {
    const out = new Map<string, '24ghz' | '5ghz'>();
    if (!raw) return out;
    const re = /"station_mac"\s*:\s*"([0-9a-fA-F]{12})"[\s\S]{0,600}?"link"\s*:\s*"([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      const mac = normalizeMac(m[1] ?? '');
      if (!mac || !HUAWEI_COLON_MAC.test(mac)) continue;
      const link = (m[2] ?? '').trim().toUpperCase();
      if (link === 'ETHERNET' || link === 'LAN' || link === 'PLC') continue;
      if (link.includes('5G') || link === '6G') out.set(mac.toLowerCase(), '5ghz');
      else if (link.includes('2.4') || link.includes('2_4')) out.set(mac.toLowerCase(), '24ghz');
    }
    return out;
  }

  private parseTopologyFromLanUserBundle(
    raw: string,
    staBandByMac: Map<string, '24ghz' | '5ghz'>,
  ): ExtractionResult['topology'] | null {
    const rows = this.collectUserDeviceRowsForTopology(raw);
    if (rows.length === 0) return null;

    const { byMac, byIp } = this.buildWlanAssociationLookup(raw);

    const cable: TopologyClient[] = [];
    const clients24: TopologyClient[] = [];
    const clients5: TopologyClient[] = [];

    for (const row of rows) {
      const client = this.userDeviceRowToTopologyClient(row);
      if (!client) continue;

      const portType = (row.PortType ?? row.portType ?? '').toUpperCase();
      if (portType === 'ETH') {
        cable.push(client);
      } else if (portType === 'WIFI') {
        const band = this.resolveK562WifiBand(row, staBandByMac, byMac, byIp);
        if (band === '5ghz') clients5.push(client);
        else clients24.push(client);
      }
    }

    if (cable.length === 0 && clients24.length === 0 && clients5.length === 0) return null;

    return {
      '24ghz': { clients: clients24, totalClients: clients24.length },
      '5ghz': { clients: clients5, totalClients: clients5.length },
      cable: { clients: cable, totalClients: cable.length },
    };
  }

  private collectUserDeviceRowsForTopology(raw: string): Record<string, string>[] {
    const parsed = this.parseAllUserDeviceRows(raw);
    const ipv4 = this.dedupeUserDevicesByDomainForTopology(
      parsed,
      (row) => (row.IPv4Enabled ?? '').trim() === '1' && this.isUserDeviceOnlineForTopology(row),
    );
    if (ipv4.length > 0) return ipv4;
    return this.dedupeUserDevicesByDomainForTopology(parsed, (row) =>
      this.isUserDeviceOnlineForTopology(row),
    );
  }

  private isUserDeviceOnlineForTopology(row: Record<string, string>): boolean {
    const status = (row.DevStatus ?? row.devStatus ?? row.Status ?? row.status ?? '').trim();
    if (!status) return true;
    return status.toUpperCase() === 'ONLINE';
  }

  private dedupeUserDevicesByDomainForTopology(
    rows: Record<string, string>[],
    keep: (row: Record<string, string>) => boolean,
  ): Record<string, string>[] {
    const byDomain = new Map<string, Record<string, string>>();
    for (const row of rows) {
      const domain = (row.Domain ?? row.domain ?? '').trim();
      if (!domain || !keep(row)) continue;
      if (!byDomain.has(domain)) byDomain.set(domain, row);
    }
    return [...byDomain.values()];
  }

  private parseAllUserDeviceRows(raw: string): Record<string, string>[] {
    const fromSignature = this.parseHuaweiStructCallAll(raw, 'USERDevice');
    if (fromSignature.length > 0) return fromSignature;
    return parseUserDeviceRowsPositional(raw);
  }

  private buildWlanAssociationLookup(raw: string): {
    byMac: Map<string, number>;
    byIp: Map<string, number>;
  } {
    const byMac = new Map<string, number>();
    const byIp = new Map<string, number>();
    const modes = this.parseHuaweiStructCallAll(raw, 'stWifiWorkingMode');
    for (const m of modes) {
      const domain = m.domain ?? m.Domain ?? '';
      const idx = parseHuaweiWlanConfigurationIndex(domain);
      if (idx == null) continue;
      const macRaw = m.MacAddress ?? m.macAddress ?? '';
      const mac = normalizeMac(macRaw);
      if (mac && HUAWEI_COLON_MAC.test(mac)) {
        byMac.set(mac.toLowerCase(), idx);
      }
      const ip = (m.IPAddress ?? m.IPAddr ?? m.ipAddress ?? '').trim();
      if (ip) byIp.set(ip, idx);
    }
    return { byMac, byIp };
  }

  private userDeviceRowToTopologyClient(row: Record<string, string>): TopologyClient | null {
    const macRaw =
      row.MacAddr ??
      row.PhysAddress ??
      row.MACAddress ??
      row.MacAddress ??
      row.physAddress ??
      row.mac ??
      '';
    const mac = normalizeMac(macRaw);
    if (!mac || !HUAWEI_COLON_MAC.test(mac)) return null;

    const ip =
      row.IpAddr?.trim() ||
      row.IPAddress?.trim() ||
      row.IPAddr?.trim() ||
      row.ipAddress?.trim() ||
      row.IP?.trim() ||
      row.ip?.trim() ||
      '';

    const host =
      row.HostName?.trim() ||
      row.hostname?.trim() ||
      row.UserDevAlias?.trim() ||
      row.Alias?.trim() ||
      row.DeviceName?.trim() ||
      row.DevName?.trim() ||
      '';

    const portType = (row.PortType ?? row.portType ?? '').toUpperCase();
    const rssiText =
      row.RSSI?.trim() ||
      row.Rssi?.trim() ||
      row.rssi?.trim() ||
      row.Signal?.trim() ||
      row.signal?.trim() ||
      '';
    let signal = 0;
    if (portType === 'WIFI' && rssiText) {
      const m = rssiText.match(/-?\d+/);
      if (m) signal = Number.parseInt(m[0], 10) || 0;
    }

    return {
      name: host || mac,
      ip,
      mac,
      signal,
    };
  }

  private resolveK562WifiBand(
    row: Record<string, string>,
    staBandByMac: Map<string, '24ghz' | '5ghz'>,
    byMac: Map<string, number>,
    byIp: Map<string, number>,
  ): '24ghz' | '5ghz' {
    const macRaw = row.MacAddr ?? row.MACAddress ?? row.MacAddress ?? row.mac ?? '';
    const mac = normalizeMac(macRaw);
    if (mac && HUAWEI_COLON_MAC.test(mac)) {
      const fromSta = staBandByMac.get(mac.toLowerCase());
      if (fromSta) return fromSta;
    }
    return resolveWifiBandForUserDevice(row, byMac, byIp);
  }

  /**
   * Routed INTERNET WAN `domain` for `x.Interface` on external pings.
   * Merges `wan_list_ap.asp` with the same `WanIP` / `WanPPP` dedupe as
   * {@link getWanState} so builds that only list PVCs on the AP page still work.
   */
  private async findInternetWanDomainForPing(): Promise<string | null> {
    const [info, list, listAp] = await Promise.all([
      this.fetch(ENDPOINT.WAN_LIST_INFO),
      this.fetch(ENDPOINT.WAN_LIST),
      this.fetch(ENDPOINT.WAN_LIST_AP),
    ]);
    const buffer = [info, list, listAp].filter((s): s is string => !!s).join('\n');
    if (!buffer) return null;

    const wanEntriesRaw: Array<{ data: Record<string, string>; encapMode: 'PPPoE' | 'IPoE' }> = [
      ...this.parseHuaweiStructCallAll(buffer, 'WanPPP').map((data) => ({
        data,
        encapMode: 'PPPoE' as const,
      })),
      ...this.parseHuaweiStructCallAll(buffer, 'WanIP').map((data) => ({
        data,
        encapMode: 'IPoE' as const,
      })),
    ];

    const seenDomainEncap = new Set<string>();
    const entries = wanEntriesRaw.filter((e) => {
      const key = `${e.encapMode}\t${e.data.domain ?? ''}`;
      if (seenDomainEncap.has(key)) return false;
      seenDomainEncap.add(key);
      return true;
    });
    if (entries.length === 0) return null;

    const isInternet = (e: { data: Record<string, string> }) =>
      (e.data.ServiceList ?? '').toUpperCase().includes('INTERNET');
    const isRouted = (e: { data: Record<string, string> }) =>
      (e.data.Mode ?? '').toUpperCase().includes('ROUTED');
    const isEnabled = (e: { data: Record<string, string> }) => (e.data.Enable ?? '') === '1';

    const chosen =
      entries.find((e) => isInternet(e) && isRouted(e) && isEnabled(e)) ??
      entries.find((e) => isInternet(e) && isRouted(e)) ??
      entries.find(isInternet) ??
      null;

    const domain = chosen?.data.domain?.trim();
    return domain ? domain : null;
  }

  private async fetchHuaweiCsrfToken(path: string): Promise<string | null> {
    const raw = await this.fetch(path);
    return this.matchInputValueById(raw, 'hwonttoken');
  }

  private fetchDiagnosePageCsrfToken(): Promise<string | null> {
    return this.fetchHuaweiCsrfToken(ENDPOINT.DIAGNOSE_COMMON);
  }

  private async pollPingResult(): Promise<{ raw: string; status: string } | null> {
    const body = await this.postPingForm(ENDPOINT.GET_PING_RESULT, '');
    if (body == null) return null;

    const decoded = this.decodeGetPingResultExpression(body);
    if (decoded == null) return null;

    const idx = decoded.indexOf(HUAWEI_PING_RESULT_DELIMITER);
    if (idx < 0) return { raw: decoded, status: 'Requested' };

    const raw = decoded.slice(0, idx);
    const tail = decoded.slice(idx + HUAWEI_PING_RESULT_DELIMITER.length).trim();
    const status = tail.split(/\s+/)[0] ?? '';
    return { raw, status };
  }

  private decodeGetPingResultExpression(src: string): string | null {
    let pos = 0;
    while (pos < src.length && src[pos] !== '"' && src[pos] !== "'") pos++;

    const parts: string[] = [];
    while (pos < src.length) {
      if (parts.length > 0) {
        while (pos < src.length && /[\s+;]/.test(src[pos]!)) pos++;
        if (pos >= src.length) break;
      }

      const quote = src[pos];
      if (quote !== '"' && quote !== "'") {
        return parts.length > 0 ? parts.join('') : null;
      }

      let i = pos + 1;
      let chunk = '';
      let closed = false;
      while (i < src.length) {
        const c = src[i]!;
        if (c === '\\') {
          if (i + 1 >= src.length) return null;
          chunk += decodeJsEscape(src, i);
          i += src[i + 1] === 'x' ? 4 : src[i + 1] === 'u' ? 6 : 2;
        } else if (c === quote) {
          closed = true;
          break;
        } else {
          chunk += c;
          i++;
        }
      }
      if (!closed) return null;
      parts.push(chunk);
      pos = i + 1;
    }

    return parts.length > 0 ? parts.join('') : null;
  }

  private parseBusyBoxPingOutput(raw: string, ip: string): PingTestResult | null {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let bytes: number | undefined;
    let ttl: number | undefined;
    const times: number[] = [];
    const sequences: number[] = [];

    for (const line of lines) {
      const headerMatch = HUAWEI_PING_HEADER_LINE.exec(line);
      if (headerMatch) {
        bytes = Number.parseInt(headerMatch[1]!, 10);
        continue;
      }
      const replyMatch = HUAWEI_PING_REPLY_LINE.exec(line);
      if (replyMatch) {
        bytes = Number.parseInt(replyMatch[1]!, 10);
        sequences.push(Number.parseInt(replyMatch[2]!, 10));
        ttl = Number.parseInt(replyMatch[3]!, 10);
        times.push(Number.parseFloat(replyMatch[4]!));
      }
    }

    const statsLine = lines.find((line) => HUAWEI_PING_STATS_LINE.test(line));
    const statsMatch = statsLine ? HUAWEI_PING_STATS_LINE.exec(statsLine) : null;
    const transmitted = statsMatch ? Number.parseInt(statsMatch[1]!, 10) : undefined;
    const received = statsMatch ? Number.parseInt(statsMatch[2]!, 10) : undefined;
    const loss = statsMatch ? Number.parseInt(statsMatch[3]!, 10) : undefined;

    const rttLine = lines.find((line) => HUAWEI_PING_RTT_LINE.test(line));
    const rttMatch = rttLine ? HUAWEI_PING_RTT_LINE.exec(rttLine) : null;
    const min = rttMatch ? Number.parseFloat(rttMatch[1]!) : undefined;
    const avg = rttMatch ? Number.parseFloat(rttMatch[2]!) : undefined;
    const max = rttMatch ? Number.parseFloat(rttMatch[3]!) : undefined;

    return PingTestResultSchema.parse({
      ip,
      bytes,
      time: times.length > 0 ? times : undefined,
      sequence: sequences.length > 0 ? sequences : undefined,
      ttl,
      packets: { transmitted, received, loss, min, avg, max },
      message: raw,
    });
  }

  private async postPingForm(path: string, body: string): Promise<string | null> {
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  private submitCgiForm(action: string, params: Record<string, string>): Promise<string | null> {
    return new Promise((resolve) => {
      if (typeof document === 'undefined' || !document.body) {
        resolve(null);
        return;
      }

      const iframeName = `__huawei_form_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('sandbox', 'allow-forms allow-same-origin');
      iframe.style.display = 'none';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = action;
      form.target = iframeName;
      form.enctype = 'application/x-www-form-urlencoded';
      form.style.display = 'none';

      for (const [key, value] of Object.entries(params)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);

      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        try {
          form.remove();
        } catch {
          /* noop */
        }
        try {
          iframe.remove();
        } catch {
          /* noop */
        }
      };
      const finish = (html: string | null) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(html);
      };

      iframe.addEventListener('load', () => {
        if (settled) return;

        let url = '';
        try {
          url = iframe.contentWindow?.location?.href ?? '';
        } catch {
          /* same-origin allowed by sandbox; defensive */
        }
        if (!url || url === 'about:blank') return;

        let html: string | null = null;
        try {
          html = iframe.contentDocument?.documentElement?.outerHTML ?? null;
        } catch {
          html = null;
        }
        finish(html);
      });

      timer = setTimeout(() => finish(null), 30_000);

      try {
        form.submit();
      } catch {
        finish(null);
      }
    });
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
