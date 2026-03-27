import { ZteBaseDriver } from '@/infra/drivers/zte/shared/ZteBaseDriver';
import {
  DHCP_LAN_ALLOCATED_ADDRESS_MAX_WAIT_MS,
  TOPOLOGY_CLIENTS_LOAD_MAX_WAIT_MS,
  TOPOLOGY_POPUP_SETTLE_MS,
} from '@/infra/drivers/zte/ZteH199Driver/constants';
import { ZteH199Selectors } from '@/infra/drivers/zte/ZteH199Driver/ZteH199Selectors';
import type { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import { IDomGateway } from '@/application/ports/IDomGateway';

export class ZteH199Driver extends ZteBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('ZTE ZXHN H199', ZteH199Selectors, topologyParser, domService, {
      dhcpLanAllocatedAddressMaxWaitMs: DHCP_LAN_ALLOCATED_ADDRESS_MAX_WAIT_MS,
      topologyClientsLoadMaxWaitMs: TOPOLOGY_CLIENTS_LOAD_MAX_WAIT_MS,
      topologyPopupSettleMs: TOPOLOGY_POPUP_SETTLE_MS,
    });
  }
}
