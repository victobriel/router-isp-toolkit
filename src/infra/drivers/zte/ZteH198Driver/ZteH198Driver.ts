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
    if (this.domService.isElementVisible(this.s.topologyTab) === false) {
      await this.activeNetSphere();
    }

    const clientsByBand: Record<TopologyBand, TopologyClient[]> = {
      '24ghz': [],
      '5ghz': [],
      cable: [],
    };

    await this.stepByStepNavigate([this.s.topologyTab]);
    clientsByBand.cable.push(
      ...(await this.extractPopupTopologyBand(
        this.s.lanTopologyShowButton,
        this.s.lanTopologyCount,
      )),
    );
    clientsByBand['24ghz'].push(
      ...(await this.extractPopupTopologyBand(
        this.s.wlan24TopologyShowButton,
        this.s.wlan24TopologyCount,
        true,
      )),
    );
    clientsByBand['5ghz'].push(
      ...(await this.extractPopupTopologyBand(
        this.s.wlan5TopologyShowButton,
        this.s.wlan5TopologyCount,
        true,
      )),
    );

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

  private async extractPopupTopologyBand(
    showButtonSelector: string,
    countSelector: string,
    includeRssi = false,
  ): Promise<TopologyClient[]> {
    if (this.getTopologyClientCount(countSelector) === 0) {
      return [];
    }

    await this.clickElementAndWait(showButtonSelector, this.s.topologyPopup);

    await Promise.race([
      this.waitForElement(this.s.topologyAccessRows, this.timeouts.topologyClientsLoadMaxWaitMs),
      this.delay(this.timeouts.topologyPopupSettleMs),
    ]).catch(() => {});

    const popup = this.domService.getHTMLElement(this.s.topologyAccessDevSection, HTMLElement);

    const clients = popup
      ? this.topologyParser.parse(popup, {
          rows: this.s.topologyAccessRows,
          hostName: this.s.topologyPopupHostName,
          macAddr: this.s.topologyPopupMacAddr,
          ipAddr: this.s.topologyPopupIpAddr,
          ...(includeRssi ? { rssi: this.s.topologyPopupRssi } : {}),
        })
      : [];

    const closeButtons = await this.domService.getHTMLElements('.closePopLayer', HTMLSpanElement);

    for (const closeButton of closeButtons) {
      this.domService.safeClick(closeButton);
    }

    await this.waitForDisappearance(this.s.topologyPopup).catch(() => {});

    return clients;
  }

  private getTopologyClientCount(selector: string): number {
    const rawValue = this.domService.getElementValue(selector)?.trim() ?? '';
    const value = Number.parseInt(rawValue, 10);
    return Number.isFinite(value) ? value : 0;
  }

  private async activeNetSphere(): Promise<void> {
    await this.stepByStepNavigate([this.s.localNetworkTab, this.s.netSphereContainer]);
    await this.expandIfCollapsed(this.s.netSphereStatusContainer, this.s.netSphereStatus);
    await this.clickElementAndWait(this.s.netSphereStatus);
    await this.domService.updateHTMLElementValue(this.s.netSphereModeSelect, 'Master');
    await this.clickElementAndWait(this.s.netSphereModeSelectSubmitButton);
  }

  protected override async extractBandSteeringData(): Promise<
    Pick<ExtractionResult, 'bandSteeringEnabled'>
  > {
    return { bandSteeringEnabled: false };
  }
}
