import { ZteBaseDriver } from '@/infra/drivers/zte/shared/ZteBaseDriver';
import {
  DHCP_LAN_ALLOCATED_ADDRESS_MAX_WAIT_MS,
  TOPOLOGY_CLIENTS_LOAD_MAX_WAIT_MS,
  TOPOLOGY_POPUP_SETTLE_MS,
} from '@/infra/drivers/zte/ZteH3601Driver/constants';
import { ZteH3601Selectors } from '@/infra/drivers/zte/ZteH3601Driver/ZteH3601Selectors';
import type { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import { IDomGateway } from '@/application/ports/IDomGateway';

export class ZteH3601Driver extends ZteBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('ZTE ZXHN H3601', ZteH3601Selectors, topologyParser, domService, {
      dhcpLanAllocatedAddressMaxWaitMs: DHCP_LAN_ALLOCATED_ADDRESS_MAX_WAIT_MS,
      topologyClientsLoadMaxWaitMs: TOPOLOGY_CLIENTS_LOAD_MAX_WAIT_MS,
      topologyPopupSettleMs: TOPOLOGY_POPUP_SETTLE_MS,
    });
  }
}
