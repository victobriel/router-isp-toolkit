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
import { HuaweiBaseDriver } from '@/infra/drivers/huawei/shared/HuaweiBaseDriver';
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
      wlan: function (): Promise<
        Pick<
          ExtractionResult,
          | 'wlan24GhzConfig'
          | 'wlan5GhzConfig'
          | 'wlan24GhzSsids'
          | 'wlan5GhzSsids'
          | 'bandSteeringEnabled'
        >
      > {
        return Promise.resolve({
          wlan24GhzConfig: undefined,
          wlan5GhzConfig: undefined,
          wlan24GhzSsids: undefined,
          wlan5GhzSsids: undefined,
          bandSteeringEnabled: undefined,
        });
      },
      lan: () => this.getLanState(),
      upnp: () => this.getUpnpState(),
      tr069: () => this.getTr069State(),
      routerInfo: function (): Promise<Pick<ExtractionResult, 'routerModel' | 'routerVersion'>> {
        return Promise.resolve({ routerModel: undefined, routerVersion: undefined });
      },
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
