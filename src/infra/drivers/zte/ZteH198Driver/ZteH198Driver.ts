import { ZteBaseDriver } from '@/infra/drivers/zte/shared/ZteBaseDriver';
import {
  DHCP_LAN_ALLOCATED_ADDRESS_MAX_WAIT_MS,
  TOPOLOGY_CLIENTS_LOAD_MAX_WAIT_MS,
  TOPOLOGY_POPUP_SETTLE_MS,
} from '@/infra/drivers/zte/ZteH198Driver/constants';
import { ZteH198Selectors } from '@/infra/drivers/zte/ZteH198Driver/ZteH198Selectors';
import type { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import { IDomGateway } from '@/application/ports/IDomGateway';
import { ExtractionResult } from '@/domain/schemas/validation';
import type { TopologyBand, TopologyClient } from '@/infra/drivers/shared/types';

export class ZteH198Driver extends ZteBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('ZTE ZXHN H198', ZteH198Selectors, topologyParser, domService, {
      dhcpLanAllocatedAddressMaxWaitMs: DHCP_LAN_ALLOCATED_ADDRESS_MAX_WAIT_MS,
      topologyClientsLoadMaxWaitMs: TOPOLOGY_CLIENTS_LOAD_MAX_WAIT_MS,
      topologyPopupSettleMs: TOPOLOGY_POPUP_SETTLE_MS,
    });
  }

  protected override async extractTopologyData(): Promise<Pick<ExtractionResult, 'topology'>> {
    const clientsByBand: Record<TopologyBand, TopologyClient[]> = {
      '24ghz': [],
      '5ghz': [],
      cable: [],
    };

    await this.stepByStepNavigate([this.s.topologyTab, this.s.lanTopologyShowButton]);
    await this.waitForElement(this.s.topologyPopup);

    const lanSection = this.domService.getHTMLElement(this.s.topologyAccessDevSection, HTMLElement);
    if (lanSection) {
      clientsByBand.cable.push(
        ...this.topologyParser.parse(lanSection, {
          rows: this.s.lanAccessRows,
          hostName: this.s.topologyPopupHostName,
          macAddr: this.s.topologyPopupMacAddr,
          ipAddr: this.s.topologyPopupIpAddr,
        }),
      );
    }

    await this.stepByStepNavigate([this.s.topologyClosePopup, this.s.wlan24TopologyShowButton]);
    await this.waitForElement(this.s.topologyPopup);

    const wlan2Section = this.domService.getHTMLElement(
      this.s.topologyAccessDevSection,
      HTMLElement,
    );
    if (wlan2Section) {
      clientsByBand['24ghz'].push(
        ...this.topologyParser.parse(wlan2Section, {
          rows: this.s.wlan2Rows,
          hostName: this.s.topologyPopupHostName,
          macAddr: this.s.topologyPopupMacAddr,
          ipAddr: this.s.topologyPopupIpAddr,
          rssi: this.s.topologyPopupRssi,
        }),
      );
    }

    await this.stepByStepNavigate([this.s.topologyClosePopup, this.s.wlan5TopologyShowButton]);
    await this.waitForElement(this.s.topologyPopup);

    const wlan5Section = this.domService.getHTMLElement(
      this.s.topologyAccessDevSection,
      HTMLElement,
    );
    if (wlan5Section) {
      clientsByBand['5ghz'].push(
        ...this.topologyParser.parse(wlan5Section, {
          rows: this.s.wlan5Rows,
          hostName: this.s.topologyPopupHostName,
          macAddr: this.s.topologyPopupMacAddr,
          ipAddr: this.s.topologyPopupIpAddr,
          rssi: this.s.topologyPopupRssi,
        }),
      );
    }

    const topology: ExtractionResult['topology'] = {
      '24ghz': {
        clients: clientsByBand['24ghz'],
        totalClients: clientsByBand['24ghz'].length,
      },
      '5ghz': {
        clients: clientsByBand['5ghz'],
        totalClients: clientsByBand['5ghz'].length,
      },
      cable: {
        clients: clientsByBand.cable,
        totalClients: clientsByBand.cable.length,
      },
    };

    return { topology };
  }

  private async activeNetSphere(): Promise<void> {
    await this.stepByStepNavigate([this.s.topologyTab, this.s.netSphereShowButton]);
    await this.waitForElement(this.s.netSphereStatus);
  }
}
