import { IDomGateway } from '@/application/ports/IDomGateway';
import { ExtractionFilter } from '@/application/types';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  ExtractionResult,
  ExtractionResultSchema,
  type PingTestResult,
} from '@/domain/schemas/validation';
import { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import { HuaweiK562E10Selectors } from '@/infra/drivers/huawei/huaweiK562E10Driver/huaweiK562E10Selectors';
import { HuaweiBaseDriver } from '@/infra/drivers/huawei/shared/HuaweiBaseDriver';
import { ENDPOINT } from '@/infra/drivers/huawei/huaweiK562E10Driver/contants';

export class HuaweiK562E10Driver extends HuaweiBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('HUAWEI K562E-10', HuaweiK562E10Selectors, topologyParser, domService);
  }

  public async extract(filter?: ExtractionFilter): Promise<ExtractionResult> {
    const extractors: Record<ExtractionFilter[number], () => Promise<Partial<ExtractionResult>>> = {
      opticalSignal: async () => ({ opticalSignal: undefined }),
      topology: function (): Promise<Partial<ExtractionResult>> {
        throw new Error('Function not implemented.');
      },
      wan: function (): Promise<Partial<ExtractionResult>> {
        throw new Error('Function not implemented.');
      },
      remoteAccess: function (): Promise<Partial<ExtractionResult>> {
        throw new Error('Function not implemented.');
      },
      wlan: function (): Promise<Partial<ExtractionResult>> {
        throw new Error('Function not implemented.');
      },
      lan: function (): Promise<Partial<ExtractionResult>> {
        throw new Error('Function not implemented.');
      },
      upnp: function (): Promise<Partial<ExtractionResult>> {
        throw new Error('Function not implemented.');
      },
      tr069: async () => ({ tr069Url: await this.getTr069Url() }),
      routerInfo: function (): Promise<Partial<ExtractionResult>> {
        throw new Error('Function not implemented.');
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
    const onLoginPage = this.isLoginPage();
    const hasTopFrame =
      this.domService.getHTMLElement('#functioncontent', HTMLElement) != null ||
      this.domService.getHTMLElement('#name_MainPage', HTMLElement) != null;
    return !onLoginPage && hasTopFrame;
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

  private async getTr069Url(): Promise<string | undefined> {
    const raw = await this.fetch(ENDPOINT.TR069_AP);
    if (!raw) return undefined;
    const value = this.matchInputValueBySelector(raw, this.s.advTr069Url);
    if (!value) return undefined;
    return value;
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
