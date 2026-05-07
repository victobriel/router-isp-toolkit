import { IDomGateway } from '@/application/ports/IDomGateway';
import { ExtractionFilter, RouterPage, RouterPageKey } from '@/application/types';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  ExtractionResult,
  ExtractionResultSchema,
  PingTestResult,
} from '@/domain/schemas/validation';
import { ITopologySectionParser } from '../../shared/TopologySectionParser';
import { HuaweiK562E10Selectors } from './huaweiK562E-10Selectors';
import { HuaweiBaseDriver } from '../shared/HuaweiBaseDriver';
import { HUAWEI_TR069_ENDPOINT } from '../shared/HuaweiCommonDriverConstants';

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
    const onLoginPage = this.isLoginPage();
    const hasTopFrame =
      this.domService.getHTMLElement('#functioncontent', HTMLElement) != null ||
      this.domService.getHTMLElement('#name_MainPage', HTMLElement) != null;
    return !onLoginPage && hasTopFrame;
  }

  public override ping(_ip: string): Promise<PingTestResult | null> {
    throw new Error('Method not implemented.');
  }

  public override reboot(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public override goToPage(_page: RouterPage, _key: RouterPageKey): void {
    throw new Error('Method not implemented.');
  }

  private async getTr069Url(): Promise<string | undefined> {
    const raw = await this.fetch(HUAWEI_TR069_ENDPOINT);
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
