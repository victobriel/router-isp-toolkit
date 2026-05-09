import { IDomGateway } from '@/application/ports/IDomGateway';
import { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import { HuaweiBaseDriver } from '@/infra/drivers/huawei/shared/HuaweiBaseDriver';
import { HuaweiEG8145V5Selectors } from '@/infra/drivers/huawei/HuaweiEG8145V5Driver/HuaweiEG8145V5Selectors';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  ExtractionResult,
  ExtractionResultSchema,
  PingTestResult,
  PingTestResultSchema,
} from '@/domain/schemas/validation';
import { ExtractionFilter } from '@/application/types';
import type { TopologyClient } from '@/infra/drivers/shared/types';
import {
  ENDPOINT,
  HUAWEI_COLON_MAC,
  HUAWEI_JS_STRING_LITERAL,
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
  HUAWEI_ST_OPTIC_INFO_KEYS_12,
  HUAWEI_ST_OPTIC_INFO_KEYS_16,
  HUAWEI_WLAN_AUTHENTICATION_MODE_LABELS,
  HUAWEI_WLAN_BANDWIDTH_LABELS,
  HUAWEI_WLAN_ENCRYPTION_MODE_LABELS,
  HUAWEI_WLAN_MODE_LABELS,
} from '@/infra/drivers/huawei/HuaweiEG8145V5Driver/constants';
import {
  decodeJsEscape,
  fetchWithMethod,
  huaweiIpv6AddressModeLabel,
  isPrivateOrLocalIPv4,
  normalizeMac,
  parseHuaweiWlanConfigurationIndex,
  parseUserDeviceRowsPositional,
  resolveWifiBandForUserDevice,
  tryReadHuaweiCsrfTokenFromDocument,
} from '@/infra/drivers/huawei/HuaweiEG8145V5Driver/utils';

/**
 * HUAWEI EG8145V5 ONT: WAN/WLAN/LAN/topology extraction and IP ping diagnostics
 * (`ping()`), using shared {@link HuaweiBaseDriver} HTML parsers where applicable.
 */
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
      lan: async () => this.getLanState(),
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

  /**
   * Drives the IPPingDiagnostics flow at `/html/bbsp/maintenance/diagnosecommon.asp`.
   *
   * The page itself uses a hidden form POST to `complex.cgi?...&RUNSTATE_FLAG=Ping`
   * to start the test and then polls `GetPingResult.asp` for a string of shape
   * `<raw ping output>[@#@]<Status>`. We do exactly the same from the extension,
   * which avoids needing an iframe / DOM scrape: cookies are shared with this
   * origin like a normal navigation. The stock UI can read `onttoken` from the
   * live diagnose page DOM; **this implementation always performs a fresh GET of
   * `diagnosecommon.asp` immediately before each state-changing POST** because the
   * firmware rotates the token on every accepted `complex.cgi` write and cached
   * values would drop the next request (see `fetchDiagnosePageCsrfToken`).
   *
   * Interface selection matters: the firmware's TR-069 IPPingDiagnostics
   * defaults to `br0` (the LAN bridge) when `x.Interface` is omitted, which
   * means external IPs and hostnames silently time out (br0 has no WAN egress).
   * For non-private targets we discover the routed INTERNET WAN from
   * `wan_list.asp` and pin the test to it; for RFC 1918 / loopback / link-local
   * targets we leave it unset so the LAN default keeps working.
   */
  public override async ping(ip: string): Promise<PingTestResult | null> {
    // Build params in the same order webSubmitForm.addParameter calls them in
    // OnApply, in case the firmware's parser is sensitive to ordering.
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

    // Token must be fetched *just before* the POST: the firmware rotates
    // onttoken on every accepted CGI write, so any cached value (DOM, prior
    // response, previous ping invocation) is already stale and will be
    // silently rejected. Without this, a second ping() call leaves the
    // firmware's PingResult buffer untouched and `GetPingResult.asp` keeps
    // replaying the previous target's output.
    const token = await this.fetchDiagnosePageCsrfToken();
    if (!token) return null;
    params['x.X_HW_Token'] = token;

    const started = await this.submitPingCgiForm(ENDPOINT.PING_DIAGNOSE, params);
    if (started == null) return null;

    // Verify the firmware actually accepted the new target. complex.cgi's
    // response is the diagnose page with the rotated state inlined as a
    // `new PingResultClass(domain, DiagnosticsState, Interface, Host, …)`
    // call. If `Host` doesn't match what we asked for, our POST was dropped
    // (typical causes: stale token, CSRF/Sec-Fetch gating, or the previous
    // test still latched). Returning null here is strictly better than
    // polling and reporting the previous target's cached result as if it
    // were ours.
    const newState = this.parseHuaweiStructCall(started, 'PingResultClass');
    if (!newState || (newState.Host ?? '') !== ip) return null;

    // complex.cgi's response also carries the rotated token — capture it for
    // the cancel path so we don't have to do another GET.
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
        // Firmware misspelling — must be sent as-is to be accepted.
        'RUNSTATE_FLAG.value': 'TERMIANL',
        'x.X_HW_Token': tokenAfterStart,
      };
      await this.submitPingCgiForm(ENDPOINT.PING_DIAGNOSE, stopParams);
    }

    if (!raw) return null;
    return this.parseBusyBoxPingOutput(raw, ip);
  }

  public override reboot(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  private async getOpticalSignalState(): Promise<Pick<ExtractionResult, 'opticalSignal'>> {
    const raw = await this.fetch(ENDPOINT.OPTICAL_INFO);
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
   * LAN topology mirrors `mainpage.asp`: scripts under `/html/bbsp/common/`
   * emit `new USERDevice(…)` rows. The live UI often loads that list via **POST**
   * (see `docs/huawei-iframe-scraping.md`); GET can be empty. POST bodies may
   * omit `function USERDevice`, so we fall back to positional parsing. Wi-Fi
   * band uses `stWifiWorkingMode` / `WLANConfiguration` index when present
   * (same rule as {@link getWlanState}).
   */
  private async getTopologyState(): Promise<Pick<ExtractionResult, 'topology'>> {
    const token = tryReadHuaweiCsrfTokenFromDocument();
    const [devInfo, dhcpInfo, lanUserInfo] = await Promise.all([
      this.fetchLanUserAsp(ENDPOINT.GET_LAN_USER_DEV_INFO, token),
      this.fetchLanUserAsp(ENDPOINT.GET_LAN_USER_DHCP_INFO, token),
      this.fetchLanUserAsp(ENDPOINT.LAN_USER_INFO, token),
    ]);
    const raw = [devInfo, dhcpInfo, lanUserInfo].filter((s): s is string => !!s).join('\n');
    if (!raw) return { topology: undefined };

    const topology = this.parseTopologyFromLanUserScripts(raw);
    return { topology: topology ?? undefined };
  }

  private parseTopologyFromLanUserScripts(raw: string): ExtractionResult['topology'] | null {
    const rows = this.collectUserDeviceRows(raw);
    if (rows.length === 0) return null;

    const { byMac, byIp } = this.buildWlanAssociationLookup(raw);

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
        const band = resolveWifiBandForUserDevice(row, byMac, byIp);
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

  /**
   * Prefer IPv4 clients (`GetUserDevInfoList()` in `GetLanUserDevInfo.asp`). If that
   * yields nothing (fragment parsers or odd `IPv4Enabled`), keep all rows with a domain.
   */
  private collectUserDeviceRows(raw: string): Record<string, string>[] {
    const parsed = this.parseAllUserDeviceRows(raw);
    const ipv4 = this.dedupeUserDevicesByDomain(
      parsed,
      (row) => (row.IPv4Enabled ?? '').trim() === '1' && this.isUserDeviceOnline(row),
    );
    if (ipv4.length > 0) return ipv4;
    return this.dedupeUserDevicesByDomain(parsed, (row) => this.isUserDeviceOnline(row));
  }

  private isUserDeviceOnline(row: Record<string, string>): boolean {
    const status = (row.DevStatus ?? row.devStatus ?? row.Status ?? row.status ?? '').trim();
    if (!status) return true;
    return status.toUpperCase() === 'ONLINE';
  }

  private dedupeUserDevicesByDomain(
    rows: Record<string, string>[],
    keep: (row: Record<string, string>) => boolean,
  ): Record<string, string>[] {
    const byDomain = new Map<string, Record<string, string>>();
    for (const row of rows) {
      const domain = (row.Domain ?? '').trim();
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

  private huaweiUserDeviceRowToTopologyClient(row: Record<string, string>): TopologyClient | null {
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

  private formatOpticalSignalSummary(
    o: Record<string, string>,
    _ontPonMode: string | null,
  ): string {
    const trim = (s: string | null | undefined) => (s ?? '').trim();

    const fmtPower = (v: string | undefined): string | null => {
      const t = trim(v);
      if (!t || t === '--') return null;
      return t.toLowerCase().includes('dbm') ? t : t;
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
      | 'ipAcquisitionMode'
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
      ipAcquisitionMode: undefined,
      requestPdEnabled: undefined,
      slaacEnabled: undefined,
      dhcpv6Enabled: undefined,
      pdEnabled: undefined,
      linkSpeed: undefined,
    };

    const [info, list, addressAcquire] = await Promise.all([
      this.fetch(ENDPOINT.WAN_LIST_INFO),
      this.fetch(ENDPOINT.WAN_LIST),
      this.fetch(ENDPOINT.WAN_ADDRESS_ACQUIRE),
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

    // LAN IPv6 — `lanaddress.asp`: `#AssignType1`/`#AssignType2` → `ManagedFlag`;
    // `#OtherType1`/`#OtherType2` → `OtherConfigFlag` (Other Information Assignment).
    let dhcpv6Enabled: boolean | undefined;
    let slaacEnabled: boolean | undefined;
    let pdEnabled: boolean | undefined;
    let requestPdEnabled: boolean | undefined;
    let ipAcquisitionMode: string | undefined;

    if (data.IPv6Enable !== '1') {
      dhcpv6Enabled = false;
      pdEnabled = false;
      requestPdEnabled = false;
    } else {
      const lanAddressRaw = await this.fetch(ENDPOINT.LAN_ADDRESS);
      const raConfig = this.parseHuaweiStructCall(lanAddressRaw, 'RaConfigInfoClass');
      const managedFlag = raConfig?.ManagedFlag;
      if (managedFlag === '1' || managedFlag === '0') {
        slaacEnabled = managedFlag === '0';
      }
      const otherConfigFlag = raConfig?.OtherConfigFlag;
      if (otherConfigFlag === '1' || otherConfigFlag === '0') {
        dhcpv6Enabled = otherConfigFlag === '1';
      }

      let prefixItem: Record<string, string> | undefined;
      let addressItem: Record<string, string> | undefined;
      if (addressAcquire && data.domain) {
        const prefixItems = this.parseHuaweiStructCallAll(addressAcquire, 'PrefixAcquireItem');
        prefixItem = prefixItems.find(
          (item) => typeof item._domain === 'string' && item._domain.includes(data.domain),
        );
        const addressItems = [
          ...this.parseHuaweiStructCallAll(addressAcquire, 'IPAddressAcquireIPItem'),
          ...this.parseHuaweiStructCallAll(addressAcquire, 'IPAddressAcquirePPPItem'),
        ];
        addressItem = addressItems.find(
          (item) => typeof item._domain === 'string' && item._domain.includes(data.domain),
        );
        const prefixOrigin = (prefixItem?._Origin ?? '').toUpperCase();
        // PrefixAcquireItem coerces AutoConfigured / RouterAdvertisement to
        // PrefixDelegation, so they should also count as PD-enabled.
        pdEnabled =
          prefixOrigin === 'PREFIXDELEGATION' ||
          prefixOrigin === 'AUTOCONFIGURED' ||
          prefixOrigin === 'ROUTERADVERTISEMENT';
      }

      // wan.asp `#IPv6AddressMode1`…`4` — map `d.IPv6AddressMode` / acquire `_Origin` to UI labels.
      const ipv6AddressModeRaw =
        data.IPv6AddressMode?.trim() || '' || addressItem?._Origin?.trim() || '';
      if (ipv6AddressModeRaw !== '') {
        const label = huaweiIpv6AddressModeLabel(ipv6AddressModeRaw);
        if (label !== undefined) {
          ipAcquisitionMode = label;
        }
      }
      // wan.asp `#IPv6PrefixMode1` → `PrefixDelegation` / DHCPv6-PD (`wan_list` ← PrefixAcquireItem).
      const ipv6PrefixModeRaw =
        data.IPv6PrefixMode?.trim() || '' || prefixItem?._Origin?.trim() || '';
      if (ipv6PrefixModeRaw !== '') {
        const u = ipv6PrefixModeRaw.toUpperCase();
        requestPdEnabled = u === 'PREFIXDELEGATION' || u === 'DHCPV6-PD';
      }
    }

    return {
      internetEnabled,
      pppoeUsername,
      ipVersion,
      ipAcquisitionMode,
      requestPdEnabled,
      slaacEnabled,
      dhcpv6Enabled,
      pdEnabled,
      linkSpeed: undefined,
    };
  }

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
    const [wlanBasic2g, wlanBasic5g, wlanAdvance2g, wlanAdvance5g] = await Promise.all([
      this.fetch(ENDPOINT.WLAN_BASIC_2G),
      this.fetch(ENDPOINT.WLAN_BASIC_5G),
      this.fetch(ENDPOINT.WLAN_ADVANCED_2G),
      this.fetch(ENDPOINT.WLAN_ADVANCED_5G),
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
        bandSteeringEnabled: undefined,
      };
    }

    const bandSteeringEnabled =
      this.extractHuaweiBandSteeringEnabledFromWlanAdvance5g(wlanAdvance5g);

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
          index: parseHuaweiWlanConfigurationIndex(domain ?? ''),
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
        index: parseHuaweiWlanConfigurationIndex(domain ?? ''),
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
      bandSteeringEnabled,
    };
  }

  private async getRemoteAccessState(): Promise<
    Pick<ExtractionResult, 'remoteAccessIpv4Enabled' | 'remoteAccessIpv6Enabled'>
  > {
    const raw = await this.fetch(ENDPOINT.NEW_ACL);
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
    >
  > {
    const raw = await this.fetch(ENDPOINT.DHCP);
    if (!raw) {
      return {
        dhcpEnabled: undefined,
        dhcpRelayStatus: undefined,
        dhcpIpAddress: undefined,
        dhcpSubnetMask: undefined,
        dhcpStartIp: undefined,
        dhcpEndIp: undefined,
        dhcpPrimaryDns: undefined,
        dhcpSecondaryDns: undefined,
        dhcpLeaseTimeMode: undefined,
      };
    }

    const lanHostInfo = this.parseHuaweiStructCallAll(raw, 'stipaddr').find((row) =>
      row.domain?.includes('.IPInterface.1'),
    );
    const dhcpMain = this.parseHuaweiStructCallAll(raw, 'dhcpmainst')[0];

    const parseLeaseTimeMode = (leaseTimeRaw: string | undefined): string | undefined => {
      const leaseTime = Number.parseInt((leaseTimeRaw ?? '').trim(), 10);
      if (!Number.isFinite(leaseTime) || leaseTime <= 0) return undefined;
      // if (leaseTime === -1 || leaseTime === 4294967295) return 'Infinite';
      // if (leaseTime % 604800 === 0) return 'Week';
      // if (leaseTime % 86400 === 0) return 'Day';
      // if (leaseTime % 3600 === 0) return 'Hour';
      // if (leaseTime % 60 === 0) return 'Minute';
      // return undefined;
      return leaseTime.toString();
    };

    const parseDns = (
      primaryRaw: string | undefined,
      secondaryRaw: string | undefined,
      mergedRaw: string | undefined,
    ): { primary: string | undefined; secondary: string | undefined } => {
      const merged = (mergedRaw ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      const primary = (primaryRaw ?? '').trim() || merged[0];
      const secondary = (secondaryRaw ?? '').trim() || merged[1];
      return {
        primary: primary || undefined,
        secondary: secondary || undefined,
      };
    };

    const dns = parseDns(
      dhcpMain?.MainPriDNS,
      dhcpMain?.MainSecDNS,
      dhcpMain?.MainDNS ?? dhcpMain?.DNSServers,
    );

    return {
      dhcpEnabled: dhcpMain?.enable === '1',
      dhcpRelayStatus: dhcpMain?.l2relayenable === '1',
      dhcpIpAddress: lanHostInfo?.ipaddr?.trim() || undefined,
      dhcpSubnetMask: lanHostInfo?.subnetmask?.trim() || undefined,
      dhcpStartIp: dhcpMain?.startip?.trim() || undefined,
      dhcpEndIp: dhcpMain?.endip?.trim() || undefined,
      dhcpPrimaryDns: dns.primary,
      dhcpSecondaryDns: dns.secondary,
      dhcpLeaseTimeMode: parseLeaseTimeMode(dhcpMain?.leasetime),
    };
  }

  private async getUpnpState(): Promise<Pick<ExtractionResult, 'upnpEnabled'>> {
    const raw = await this.fetch(ENDPOINT.UPNP);
    if (!raw) return { upnpEnabled: undefined };
    const main = this.matchHuaweiScriptVar(raw, 'enblMainUpnp');
    const slave = this.matchHuaweiScriptVar(raw, 'enblSlvUpnp');
    if (main == null || slave == null) return { upnpEnabled: undefined };
    return { upnpEnabled: main === '1' && slave === '1' };
  }

  private async getTr069State(): Promise<Pick<ExtractionResult, 'tr069Url' | 'tr069Enabled'>> {
    const raw = await this.fetch(ENDPOINT.TR069);
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
    const raw = await this.fetch(ENDPOINT.DEVICE_INFO);
    if (!raw) return { routerModel: undefined, routerVersion: undefined };
    // Firmware usually leaves `#td1_2` / `#td5_2` empty in the raw ASP and fills them
    // from `deviceInfo` in on-page script (`deviceinfo.asp`); values are in `new stDeviceInfo(...)`.
    const fromJs = this.parseHuaweiStructCall(raw, 'stDeviceInfo');
    const routerModel =
      (fromJs?.ModelName?.trim() || this.matchHuaweiTdTextById(raw, 'td1_2')) ?? undefined;
    const routerVersion =
      (fromJs?.SoftwareVersion?.trim() || this.matchHuaweiTdTextById(raw, 'td5_2')) ?? undefined;
    return { routerModel, routerVersion };
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

  /** Prefer POST (matches live `GetLanUserDevInfo.asp` usage); fall back to GET. */
  private async fetchLanUserAsp(path: string, csrfToken: string | null): Promise<string | null> {
    const postBody = csrfToken ? `x.X_HW_Token=${encodeURIComponent(csrfToken)}` : '';
    const post = await fetchWithMethod(path, 'POST', postBody);
    if (post && /new\s+USERDevice\s*\(/i.test(post)) return post;
    const get = await fetchWithMethod(path, 'GET');
    if (get && /new\s+USERDevice\s*\(/i.test(get)) return get;
    return post ?? get;
  }

  /**
   * Fetch a fresh Huawei CSRF token (`onttoken`) from `diagnosecommon.asp`.
   *
   * Why no DOM shortcut: the firmware rotates `onttoken` on every accepted
   * `complex.cgi` write, so the value embedded in the live page (or in the
   * response of the previous CGI POST) goes stale immediately after use.
   * Reading the DOM-cached token across calls causes the next CGI POST to be
   * silently dropped — the firmware returns 200 with a redirect-to-diagnose
   * page but never updates state. Always read the token from a fresh GET of
   * the diagnose page, immediately before the POST that needs it.
   */
  private async fetchDiagnosePageCsrfToken(): Promise<string | null> {
    const raw = await this.fetch(ENDPOINT.DIAGNOSE_COMMON);
    return this.matchInputValueById(raw, 'hwonttoken');
  }

  /**
   * Discover the routed INTERNET WAN's TR-069 `domain` so `ping()` can pin
   * external probes to the WAN side. Mirrors the WAN selection logic of
   * `getWanState` in this driver: prefer routed + INTERNET + enabled,
   * then routed + INTERNET, then any INTERNET, else `null` (e.g. bridged
   * mode, or `wan_list*.asp` not exposed by this firmware).
   */
  private async findInternetWanDomainForPing(): Promise<string | null> {
    const [info, list] = await Promise.all([
      this.fetch(ENDPOINT.WAN_LIST_INFO),
      this.fetch(ENDPOINT.WAN_LIST),
    ]);
    if (!info && !list) return null;
    const buffer = `${info ?? ''}\n${list ?? ''}`;

    const entries = [
      ...this.parseHuaweiStructCallAll(buffer, 'WanPPP'),
      ...this.parseHuaweiStructCallAll(buffer, 'WanIP'),
    ];
    if (entries.length === 0) return null;

    const isInternet = (e: Record<string, string>) =>
      (e.ServiceList ?? '').toUpperCase().includes('INTERNET');
    const isRouted = (e: Record<string, string>) => (e.Mode ?? '').toUpperCase().includes('ROUTED');
    const isEnabled = (e: Record<string, string>) => (e.Enable ?? '') === '1';

    const chosen =
      entries.find((e) => isInternet(e) && isRouted(e) && isEnabled(e)) ??
      entries.find((e) => isInternet(e) && isRouted(e)) ??
      entries.find(isInternet) ??
      null;

    const domain = chosen?.domain?.trim();
    return domain ? domain : null;
  }

  /**
   * Poll `GetPingResult.asp` and split firmware output into raw ping text and
   * trailing status (after the `[@#@]` delimiter, see `HUAWEI_PING_RESULT_DELIMITER`).
   */
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

  /**
   * Decode the JS expression returned by `GetPingResult.asp`. The body is a
   * concatenation of one or more single- or double-quoted string literals
   * separated by `+` and whitespace, e.g.
   *
   *     "PING 1.2.3.4 ...\n" +
   *     "64 bytes from 1.2.3.4: ... ms\n"
   *     + "[@#@]Complete";
   *
   * The original page does `eval(data)`; we walk literals manually because MV3
   * extensions cannot `eval`. Supports `\xNN`, `\uNNNN`, and the standard
   * single-char escapes (`\n`, `\r`, `\t`, `\\`, `\"`, `\'`, …). Any leading
   * non-quote bytes are skipped so the `data.substr(8)` workaround inside
   * `GetPingResult` (firmware occasionally emits `\n\n" + ` style preambles)
   * isn't needed.
   */
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

  /**
   * Parse Huawei/BusyBox-style ping output into `PingTestResult`. Differs from
   * `BaseRouter.parsePingTestResult` (which targets ZTE/Windows-style replies):
   *
   *     PING 1.2.3.4 (1.2.3.4): 56 data bytes
   *     64 bytes from 1.2.3.4: seq=0 ttl=64 time=12.345 ms
   *     ...
   *     --- 1.2.3.4 ping statistics ---
   *     2 packets transmitted, 2 packets received, 0% packet loss
   *     round-trip min/avg/max = 12.345/13.456/14.567 ms
   *
   * Mid-test buffers (status `Requested`) lack the trailing stats/RTT block, so
   * those fields are intentionally optional and left undefined when absent.
   */
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

  /**
   * POST `application/x-www-form-urlencoded` to a diagnostics path (used for
   * `GetPingResult.asp` polling; distinct from iframe-based `complex.cgi`).
   */
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

  /**
   * Submit a `complex.cgi` form via a hidden iframe-targeted form, byte-for-byte
   * the same way `webSubmitForm.submit()` does on `diagnosecommon.asp`.
   *
   * Why not `fetch`: some Huawei builds gate state-mutating CGIs on
   * `Sec-Fetch-Mode: navigate`, which `fetch` cannot produce — XHR submits land
   * with `Sec-Fetch-Mode: cors` and get silently dropped (response is the
   * unchanged diagnose page, polling keeps replaying the previous test). A
   * real form submit into a same-origin iframe target produces a proper
   * navigation, including the headers the firmware expects.
   *
   * The iframe is sandboxed without `allow-scripts` so the response page's
   * inline scripts (auto-pollers, `LoadFrame`, `setInterval` registrations)
   * do not run inside the hidden iframe; we still get full `outerHTML` access
   * via `allow-same-origin`. Form parameter order matches `OnApply` exactly.
   */
  private submitPingCgiForm(
    action: string,
    params: Record<string, string>,
  ): Promise<string | null> {
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

        // Some browsers fire `load` for the implicit about:blank document
        // before the form's navigation completes; we want only the response.
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
}
