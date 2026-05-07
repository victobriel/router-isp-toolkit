import { IDomGateway } from '@/application/ports/IDomGateway';
import { ITopologySectionParser } from '../../shared/TopologySectionParser';
import { HuaweiBaseDriver } from '../shared/HuaweiBaseDriver';
import { HuaweiEG8145V5Selectors } from './HuaweiEG8145V5Selectors';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  ExtractionResult,
  ExtractionResultSchema,
  PingTestResult,
} from '@/domain/schemas/validation';
import { ExtractionFilter, RouterPage, RouterPageKey } from '@/application/types';
import {
  HUAWEI_INDEX_ENDPOINT,
  HUAWEI_TR069_ENDPOINT,
  HUAWEI_UPNP_ENDPOINT,
  HUAWEI_ACCESS_CONTROL_ENDPOINT,
  HUAWEI_WAN_ADDRESS_ACQUIRE_ENDPOINT,
  HUAWEI_WAN_LIST_ENDPOINT,
  HUAWEI_WAN_LIST_INFO_ENDPOINT,
  HUAWEI_WLAN24G_ADVANCED_ENDPOINT,
  HUAWEI_WLAN24G_ENDPOINT,
  HUAWEI_WLAN5G_ADVANCED_ENDPOINT,
  HUAWEI_WLAN5G_ENDPOINT,
  HUAWEI_OPTICAL_INFO_ENDPOINT,
  HUAWEI_GET_LAN_USER_DEV_INFO_ENDPOINT,
  HUAWEI_LAN_USER_INFO_ENDPOINT,
} from '../shared/HuaweiCommonDriverConstants';
import type { TopologyClient } from '@/infra/drivers/shared/types';

/** Huawei `stWlanWifi` channel width / `X_HW_HT20` codes → display label */
const HUAWEI_WLAN_BANDWIDTH_LABELS: Partial<Record<string, string>> = {
  '0': 'Auto',
  '1': '20MHz',
  '2': '40MHz',
  '3': 'Auto',
};

/** Huawei `mode` / `X_HW_Standard` codes → display label */
const HUAWEI_WLAN_MODE_LABELS: Partial<Record<string, string>> = {
  '11b': '802.11b',
  '11g': '802.11g',
  '11bg': '802.11b/g',
  '11bgn': '802.11b/g/n',
  '11a': '802.11a',
  '11na': '802.11a/n',
  '11ac': '802.11a/n/ac',
};

const HUAWEI_WLAN_AUTHENTICATION_MODE_LABELS: Partial<Record<string, string>> = {
  Basic: 'Open',
  WPA: 'WPA',
  '11i': 'WPA2',
  WPAand11i: 'WPA/WPA2',
};

const HUAWEI_WLAN_ENCRYPTION_MODE_LABELS: Partial<Record<string, string>> = {
  AESEncryption: 'AES',
  TKIPEncryption: 'TKIP',
  TKIPandAESEncryption: 'TKIP&AES',
};

/**
 * `opticinfo.asp` declares two `stOpticInfo` shapes (GPON vs RF ONT). Map the
 * `new stOpticInfo(...)` positional args after decoding — do not rely on
 * `parseHuaweiStructCall`, which would bind to the first `function stOpticInfo`
 * in the HTML and mis-align when the firmware uses the longer constructor.
 */
const HUAWEI_ST_OPTIC_INFO_KEYS_12 = [
  'domain',
  'LinkStatus',
  'transOpticPower',
  'revOpticPower',
  'voltage',
  'temperature',
  'bias',
  'rfRxPower',
  'rfOutputPower',
  'VendorName',
  'VendorSN',
] as const;

const HUAWEI_ST_OPTIC_INFO_KEYS_16 = [
  ...HUAWEI_ST_OPTIC_INFO_KEYS_12,
  'DateCode',
  'TxWaveLength',
  'RxWaveLength',
  'MaxTxDistance',
  'LosStatus',
] as const;

/** Same literal pattern as {@link HuaweiBaseDriver}'s `parseHuaweiStructCall`. */
const HUAWEI_JS_STRING_LITERAL = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;

export class HuaweiEG8145V5Driver extends HuaweiBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('HUAWEI EG8145V5', HuaweiEG8145V5Selectors, topologyParser, domService);
  }

  public async extract(filter?: ExtractionFilter): Promise<ExtractionResult> {
    const extractors: Record<ExtractionFilter[number], () => Promise<Partial<ExtractionResult>>> = {
      opticalSignal: async () => this.getOpticalSignalState(),
      topology: async () => this.getTopologyState(),
      wan: async () => this.getWanState(),
      remoteAccess: async () => this.getRemoteAccessState(),
      wlan: async () => this.getWlanState(),
      lan: async () => {
        return {
          lan: undefined,
          dhcpIpAddress: undefined,
          dhcpSubnetMask: undefined,
          dhcpStartIp: undefined,
          dhcpEndIp: undefined,
          dhcpPrimaryDns: undefined,
          dhcpSecondaryDns: undefined,
          dhcpLeaseTimeMode: undefined,
        };
      },
      upnp: async () => this.getUpnpState(),
      tr069: async () => this.getTr069State(),
      routerInfo: async () => this.getRouterInfoState(),
    };

    const keys = filter?.length ? filter : Object.keys(extractors);
    const data: Partial<ExtractionResult> = {};
    for (const key of keys) {
      const extractor = extractors[key as ExtractionFilter[number]];
      if (!extractor) continue;
      Object.assign(data, await extractor());
    }
    data.timestamp = new Date().toISOString();
    data.goToHomePage = this.goToHomePage();

    return ExtractionResultSchema.parse(data);
  }

  public buttonElementConfig(): ButtonConfig | null {
    return {
      targetSelector: '#logininfo',
      text: 'Run data extraction',
      style: `
        position: absolute;
        bottom: 6.5px;
        left: 27px;
        z-index: 10000;
        padding: 8px;
        color: white;
        border: none;
        cursor: pointer;
        background-color: transparent;
      `,
      extLogoStyle: `
        font-size: 9px;
        color: #FFFFFF90;
        margin-left: 4px;
      `,
    };
  }

  public override isAuthenticated(): boolean {
    const $homeTab = this.domService.getHTMLElement(this.s.homeTab, HTMLElement);
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && !!$homeTab;
  }

  public override ping(ip: string): Promise<PingTestResult | null> {
    throw new Error('Method not implemented.');
  }

  public override reboot(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public override goToPage(page: RouterPage, key: RouterPageKey): void {
    throw new Error('Method not implemented.');
  }

  private async getOpticalSignalState(): Promise<Pick<ExtractionResult, 'opticalSignal'>> {
    const raw = await this.fetch(HUAWEI_OPTICAL_INFO_ENDPOINT);
    if (!raw) return { opticalSignal: undefined };

    const optic = this.parseStOpticInfo(raw);
    if (!optic) return { opticalSignal: undefined };

    const ontPonMode = this.matchHuaweiScriptVar(raw, 'ontPonMode');
    const summary = this.formatOpticalSignalSummary(optic, ontPonMode);
    return { opticalSignal: summary || undefined };
  }

  /**
   * Parses the first `new stOpticInfo('…', …)` row from `opticinfo.asp`
   * (`docs/opticinfo-example.asp`): TX/RX optical power, link state, optional
   * wavelengths (16-arg GPON form) or the shorter RF ONT form (12 args).
   */
  private parseStOpticInfo(raw: string): Record<string, string> | null {
    const call = /new\s+stOpticInfo\s*\(([\s\S]*?)\)/.exec(raw);
    if (!call) return null;

    const values = Array.from(call[1].matchAll(HUAWEI_JS_STRING_LITERAL), (m) =>
      this.unescapeHuaweiHex(m[1] ?? m[2]),
    );
    if (values.length < 12) return null;

    const keys = values.length >= 16 ? HUAWEI_ST_OPTIC_INFO_KEYS_16 : HUAWEI_ST_OPTIC_INFO_KEYS_12;
    const record: Record<string, string> = {};
    const len = Math.min(keys.length, values.length);
    for (let i = 0; i < len; i++) {
      record[keys[i]] = values[i];
    }
    return record;
  }

  /**
   * LAN / Wi-Fi client topology from the same scripts as `mainpage.asp`:
   * {@link HUAWEI_GET_LAN_USER_DEV_INFO_ENDPOINT} + {@link HUAWEI_LAN_USER_INFO_ENDPOINT}.
   * `SetDeviceNum` splits `UserDevinfo` by `PortType` ETH vs WIFI; Wi-Fi band uses
   * `WLANConfiguration` index (same rule as {@link getWlanState}).
   */
  private async getTopologyState(): Promise<Pick<ExtractionResult, 'topology'>> {
    const [getLanUserDev, lanUserInfo] = await Promise.all([
      this.fetch(HUAWEI_GET_LAN_USER_DEV_INFO_ENDPOINT),
      this.fetch(HUAWEI_LAN_USER_INFO_ENDPOINT),
    ]);
    const raw = [getLanUserDev, lanUserInfo].filter((s): s is string => !!s).join('\n');
    if (!raw) return { topology: undefined };

    const topology = this.parseTopologyFromLanUserScripts(raw);
    return { topology: topology ?? undefined };
  }

  private parseTopologyFromLanUserScripts(raw: string): ExtractionResult['topology'] | null {
    const rows = this.parseHuaweiStructCallAll(raw, 'USERDevice');
    if (rows.length === 0) return null;

    const cable: TopologyClient[] = [];
    const clients24: TopologyClient[] = [];
    const clients5: TopologyClient[] = [];

    for (const row of rows) {
      const client = this.huaweiUserDeviceRowToTopologyClient(row);
      if (!client) continue;

      const portType = (row.PortType ?? row.portType ?? '').toUpperCase();
      if (portType === 'ETH') {
        cable.push(client);
      } else if (portType === 'WIFI') {
        const domain = row.domain ?? row.Domain ?? '';
        const wlanIdx = HuaweiEG8145V5Driver.parseHuaweiWlanConfigurationIndex(domain);
        if (wlanIdx != null && wlanIdx >= 5) clients5.push(client);
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

  private huaweiUserDeviceRowToTopologyClient(row: Record<string, string>): TopologyClient | null {
    const macRaw =
      row.PhysAddress ??
      row.MACAddress ??
      row.MacAddress ??
      row.physAddress ??
      row.mac ??
      '';
    const mac = HuaweiEG8145V5Driver.normalizeMac(macRaw);
    if (!mac || !HuaweiEG8145V5Driver.COLON_MAC.test(mac)) return null;

    const ip =
      row.IPAddress?.trim() ||
      row.IPAddr?.trim() ||
      row.ipAddress?.trim() ||
      row.IP?.trim() ||
      row.ip?.trim() ||
      '';

    const host =
      row.HostName?.trim() ||
      row.hostname?.trim() ||
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

  private static readonly COLON_MAC = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

  private static normalizeMac(s: string): string {
    const t = s.replace(/-/g, ':').trim();
    if (HuaweiEG8145V5Driver.COLON_MAC.test(t)) return t.toLowerCase();
    const compact = t.replace(/:/g, '');
    if (compact.length === 12 && /^[0-9A-Fa-f]{12}$/i.test(compact)) {
      return compact
        .toLowerCase()
        .match(/.{1,2}/g)!
        .join(':');
    }
    return t.toLowerCase();
  }

  /** Same index convention as {@link getWlanState} (`WLANConfiguration.N`). */
  private static parseHuaweiWlanConfigurationIndex(domain: string): number | null {
    const match = /\.WLANConfiguration\.(\d+)/.exec(domain);
    if (!match) return null;
    const index = Number.parseInt(match[1], 10);
    return Number.isNaN(index) ? null : index;
  }

  private formatOpticalSignalSummary(o: Record<string, string>, ontPonMode: string | null): string {
    const trim = (s: string | null | undefined) => (s ?? '').trim();

    const fmtPower = (v: string | undefined): string | null => {
      const t = trim(v);
      if (!t || t === '--') return null;
      return t.toLowerCase().includes('dbm') ? t : `${t} dBm`;
    };

    // const tx = fmtPower(o.transOpticPower);
    const rx = fmtPower(o.revOpticPower);
    // const link = trim(o.LinkStatus);
    const parts: string[] = [];

    // const mode = trim(ontPonMode);
    // if (mode && mode.toLowerCase() !== 'auto') {
    //   parts.push(mode.toUpperCase());
    // }
    // if (link) {
    //   parts.push(link.toLowerCase() === 'ok' ? 'OK' : link);
    // }
    // if (tx) parts.push(`TX ${tx}`);
    // if (rx) parts.push(`RX ${rx}`);
    if (rx) parts.push(`${rx}`);

    // const txWl = trim(o.TxWaveLength);
    // const rxWl = trim(o.RxWaveLength);
    // if (txWl && rxWl && txWl !== '--' && rxWl !== '--') {
    //   parts.push(`${txWl}/${rxWl} nm`);
    // }

    return parts.join(' · ');
  }

  private async getWanState(): Promise<
    Pick<
      ExtractionResult,
      | 'internetEnabled'
      | 'pppoeUsername'
      | 'ipVersion'
      | 'requestPdEnabled'
      | 'slaacEnabled'
      | 'dhcpv6Enabled'
      | 'pdEnabled'
      | 'linkSpeed'
    >
  > {
    const undefinedResult = {
      internetEnabled: undefined,
      pppoeUsername: undefined,
      ipVersion: undefined,
      requestPdEnabled: undefined,
      slaacEnabled: undefined,
      dhcpv6Enabled: undefined,
      pdEnabled: undefined,
      linkSpeed: undefined,
    };

    const [info, list, addressAcquire] = await Promise.all([
      this.fetch(HUAWEI_WAN_LIST_INFO_ENDPOINT),
      this.fetch(HUAWEI_WAN_LIST_ENDPOINT),
      this.fetch(HUAWEI_WAN_ADDRESS_ACQUIRE_ENDPOINT),
    ]);

    if (!info || !list) return undefinedResult;

    // wan_list.asp only contains the `new WanPPP(...)` / `new WanIP(...)` calls,
    // while wan_list_info.asp holds their constructor signatures. Concatenate so
    // the existing `parseHuaweiStructCall*` helpers find both in one buffer.
    const wanListBuffer = `${info}\n${list}`;

    const wanEntries: Array<{
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

    if (wanEntries.length === 0) return undefinedResult;

    // Pick the routed INTERNET WAN — that is what wan.asp's form binds to when
    // the user selects the Internet entry. Fall back to any INTERNET WAN, then
    // to the first entry, mirroring how the firmware itself iterates WanList.
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
      encapMode === 'PPPoE' ? (data.Username ? data.Username : undefined) : undefined;

    // Mirror GetProtocolType() in wan_list_info.asp.
    let ipVersion: string | undefined;
    if (data.IPv4Enable === '1' && data.IPv6Enable === '1') ipVersion = 'IPv4/IPv6';
    else if (data.IPv4Enable === '1') ipVersion = 'IPv4';
    else if (data.IPv6Enable === '1') ipVersion = 'IPv6';

    // IPv6 acquisition modes — match wan.asp's #IPv6AddressMode1 (DHCPv6) and
    // #IPv6PrefixMode1 (PrefixDelegation) radios. The actual values are patched
    // onto each WanList entry by GetIPv6AddressAcquireInfo / GetIPv6PrefixAcquireInfo
    // in wan_list.asp, sourced from wanaddressacquire.asp.
    let dhcpv6Enabled: boolean | undefined;
    let pdEnabled: boolean | undefined;

    if (data.IPv6Enable !== '1') {
      dhcpv6Enabled = false;
      pdEnabled = false;
    } else if (addressAcquire && data.domain) {
      const addressItems = [
        ...this.parseHuaweiStructCallAll(addressAcquire, 'IPAddressAcquireIPItem'),
        ...this.parseHuaweiStructCallAll(addressAcquire, 'IPAddressAcquirePPPItem'),
      ];
      const prefixItems = this.parseHuaweiStructCallAll(addressAcquire, 'PrefixAcquireItem');

      const addressItem = addressItems.find(
        (item) => typeof item._domain === 'string' && item._domain.includes(data.domain),
      );
      const prefixItem = prefixItems.find(
        (item) => typeof item._domain === 'string' && item._domain.includes(data.domain),
      );

      const addressOrigin = (addressItem?._Origin ?? '').toUpperCase();
      const prefixOrigin = (prefixItem?._Origin ?? '').toUpperCase();

      dhcpv6Enabled = addressOrigin === 'DHCPV6';
      // PrefixAcquireItem coerces AutoConfigured / RouterAdvertisement to
      // PrefixDelegation, so they should also count as PD-enabled.
      pdEnabled =
        prefixOrigin === 'PREFIXDELEGATION' ||
        prefixOrigin === 'AUTOCONFIGURED' ||
        prefixOrigin === 'ROUTERADVERTISEMENT';
    }

    return {
      internetEnabled,
      pppoeUsername,
      ipVersion,
      requestPdEnabled: undefined,
      slaacEnabled: undefined,
      dhcpv6Enabled,
      pdEnabled,
      linkSpeed: undefined,
    };
  }

  private async getWlanState(): Promise<
    Pick<
      ExtractionResult,
      'wlan24GhzConfig' | 'wlan5GhzConfig' | 'wlan24GhzSsids' | 'wlan5GhzSsids'
    >
  > {
    const [wlanBasic2g, wlanBasic5g, wlanAdvance2g, wlanAdvance5g] = await Promise.all([
      this.fetch(HUAWEI_WLAN24G_ENDPOINT),
      this.fetch(HUAWEI_WLAN5G_ENDPOINT),
      this.fetch(HUAWEI_WLAN24G_ADVANCED_ENDPOINT),
      this.fetch(HUAWEI_WLAN5G_ADVANCED_ENDPOINT),
    ]);

    const allRaw = [wlanBasic2g, wlanBasic5g, wlanAdvance2g, wlanAdvance5g]
      .filter((raw): raw is string => !!raw)
      .join('\n');

    if (!allRaw) {
      return {
        wlan24GhzConfig: undefined,
        wlan5GhzConfig: undefined,
        wlan24GhzSsids: undefined,
        wlan5GhzSsids: undefined,
      };
    }

    const parseWlanIndex = (domain: string | undefined): number | null => {
      if (!domain) return null;
      const match = /\.WLANConfiguration\.(\d+)/.exec(domain);
      if (!match) return null;
      const index = Number.parseInt(match[1], 10);
      return Number.isNaN(index) ? null : index;
    };

    const is2gIndex = (index: number | null): boolean => index != null && index <= 4;
    const is5gIndex = (index: number | null): boolean => index != null && index >= 5;

    const wlanWifiRows = [
      ...this.parseHuaweiStructCallAll(allRaw, 'stWlanWifi').map((row) => {
        const domain = row.domain ?? row.Domain;
        const bandWidth = row.channelWidth ?? row.X_HW_HT20;
        const bandWidthKey =
          bandWidth !== undefined && bandWidth !== null && bandWidth !== ''
            ? String(bandWidth)
            : undefined;
        const bandWidthLabel = bandWidthKey
          ? HUAWEI_WLAN_BANDWIDTH_LABELS[bandWidthKey]
          : undefined;

        const mode = row.mode ?? row.X_HW_Standard;
        const modeKey =
          mode !== undefined && mode !== null && mode !== '' ? String(mode) : undefined;
        const modeLabel = modeKey ? HUAWEI_WLAN_MODE_LABELS[modeKey] : undefined;

        return {
          domain,
          index: parseWlanIndex(domain),
          enabled: row.enable ?? row.Enable,
          mode: modeLabel,
          channel: row.channel ?? row.Channel,
          transmittingPower: `${row.power ?? row.TransmitPower}%`,
          bandWidth: bandWidthLabel,
        };
      }),
    ];

    const wlanRows = this.parseHuaweiStructCallAll(allRaw, 'stWlan').map((row) => {
      const domain = row.domain ?? row.Domain;
      const authenticationMode = row.BeaconType;
      const encryptionMode = row.X_HW_WPAand11iEncryptionModes;

      const authModeLabel = authenticationMode
        ? HUAWEI_WLAN_AUTHENTICATION_MODE_LABELS[authenticationMode]
        : undefined;
      const encryptModeLabel = encryptionMode
        ? HUAWEI_WLAN_ENCRYPTION_MODE_LABELS[encryptionMode]
        : undefined;

      return {
        domain,
        index: parseWlanIndex(domain),
        enabled: row.enable ?? row.Enable,
        ssid: row.ssid ?? row.SSID,
        ssidHideMode: !row.wlHide,
        wpa2SecurityType: [authModeLabel, encryptModeLabel].filter(Boolean).join('-'),
        maxClients: row.DeviceNum,
      };
    });

    const preSharedRows = this.parseHuaweiStructCallAll(allRaw, 'stPreSharedKey').map((row) => ({
      domain: row.domain,
      password: row.psk || row.kpp || '',
    }));

    const findBandConfig = (isBandIndex: (idx: number | null) => boolean) => {
      const row = wlanWifiRows.find((item) => isBandIndex(item.index));
      if (!row) return undefined;
      return {
        enabled: row.enabled === '1',
        channel: row.channel || undefined,
        mode: row.mode || undefined,
        bandWidth: row.bandWidth || undefined,
        transmittingPower: row.transmittingPower || undefined,
      };
    };

    const buildSsids = (isBandIndex: (idx: number | null) => boolean) => {
      const bandRows = wlanRows.filter((row) => isBandIndex(row.index));
      if (!bandRows.length) return undefined;
      return bandRows.map((row) => {
        const password =
          preSharedRows.find((key) => key.domain?.includes(row.domain || ''))?.password ||
          undefined;
        const maxClients = Number.parseInt(row.maxClients ?? '', 10);
        return {
          enabled: row.enabled === '1',
          ssidName: row.ssid || undefined,
          ssidPassword: password,
          ssidHideMode: row.ssidHideMode,
          wpa2SecurityType: row.wpa2SecurityType || undefined,
          maxClients: Number.isNaN(maxClients) ? undefined : maxClients,
        };
      });
    };

    return {
      wlan24GhzConfig: findBandConfig(is2gIndex),
      wlan5GhzConfig: findBandConfig(is5gIndex),
      wlan24GhzSsids: buildSsids(is2gIndex),
      wlan5GhzSsids: buildSsids(is5gIndex),
    };
  }

  private async getRemoteAccessState(): Promise<
    Pick<ExtractionResult, 'remoteAccessIpv4Enabled' | 'remoteAccessIpv6Enabled'>
  > {
    const raw = await this.fetch(HUAWEI_ACCESS_CONTROL_ENDPOINT);
    if (!raw) {
      return { remoteAccessIpv4Enabled: undefined, remoteAccessIpv6Enabled: undefined };
    }

    const masterToggle = this.parseHuaweiStructCall(raw, 'stNewAclEnable');
    const aclEnabled = masterToggle?.enable === '1';

    const hasHttpRule = this.parseHuaweiStructCallAll(raw, 'stNewDeviceAcl').some((rule) =>
      rule.Protocol.toUpperCase()
        .split(',')
        .map((p) => p.trim())
        .includes('HTTP'),
    );

    return {
      remoteAccessIpv4Enabled: aclEnabled && hasHttpRule,
      remoteAccessIpv6Enabled: undefined,
    };
  }

  private async getUpnpState(): Promise<Pick<ExtractionResult, 'upnpEnabled'>> {
    const raw = await this.fetch(HUAWEI_UPNP_ENDPOINT);
    if (!raw) return { upnpEnabled: undefined };
    const main = this.matchHuaweiScriptVar(raw, 'enblMainUpnp');
    const slave = this.matchHuaweiScriptVar(raw, 'enblSlvUpnp');
    if (main == null || slave == null) return { upnpEnabled: undefined };
    return { upnpEnabled: main === '1' && slave === '1' };
  }

  private async getTr069State(): Promise<Pick<ExtractionResult, 'tr069Url' | 'tr069Enabled'>> {
    const raw = await this.fetch(HUAWEI_TR069_ENDPOINT);
    const cwmp = this.parseHuaweiCwmp(raw);
    if (!cwmp) return { tr069Url: undefined, tr069Enabled: undefined };
    return {
      tr069Url: cwmp.URL ? cwmp.URL : undefined,
      tr069Enabled: cwmp.EnableCWMP === '1',
    };
  }

  private async getRouterInfoState(): Promise<
    Pick<ExtractionResult, 'routerModel' | 'routerVersion'>
  > {
    const raw = await this.fetch(HUAWEI_INDEX_ENDPOINT);
    if (!raw) return { routerModel: undefined, routerVersion: undefined };
    const productName = this.matchHuaweiScriptVar(raw, 'ProductName');
    return {
      routerModel: productName ?? undefined,
      routerVersion: undefined,
    };
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
