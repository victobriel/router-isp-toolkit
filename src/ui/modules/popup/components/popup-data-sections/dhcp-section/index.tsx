import { GoToPageOptions, RouterPage, RouterPageKey } from '@/application/types';
import { ExtractionResult } from '@/domain/schemas/validation';
import { translator } from '@/infra/i18n/I18nService';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { val } from '@/ui/lib/utils';
import {
  PopupDataRow,
  PopupDataRowProps,
} from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/types/router-data.types';
import { Network } from 'lucide-react';

interface DhcpSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
  supportsGoToPage: boolean;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
}

export const DhcpSection = ({
  data,
  routerPreferencesComparison,
  supportsGoToPage,
  goToPage,
}: DhcpSectionProps) => {
  const handleGoToPage = (page: RouterPage, key: RouterPageKey) => {
    void goToPage(page, key);
  };

  const rowGo = (fn: () => void): (() => void) | undefined => (supportsGoToPage ? fn : undefined);

  const dhcpData = {
    enabled: data.dhcpEnabled,
    dhcpRelayStatus: data.dhcpRelayStatus,
    ipAddress: data.dhcpIpAddress,
    subnetMask: data.dhcpSubnetMask,
    startIp: data.dhcpStartIp,
    endIp: data.dhcpEndIp,
    ispDnsEnabled: data.dhcpIspDnsEnabled,
    primaryDns: data.dhcpPrimaryDns,
    secondaryDns: data.dhcpSecondaryDns,
    leaseTimeMode: data.dhcpLeaseTimeMode,
    leaseTime: data.dhcpLeaseTime,
  };

  const dataIsEmpty = Object.values(dhcpData).every(
    (value) => value === undefined || value === null,
  );

  if (dataIsEmpty) return null;

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_enabled'),
      compareMatch: routerPreferencesComparison?.dhcpEnabled,
      value: dhcpData.enabled,
      handleGoToPage: rowGo(() => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_STATUS)),
    },
    {
      label: translator.t('popup_label_dhcp_l2_relay_status'),
      compareMatch: routerPreferencesComparison?.dhcpRelayStatus,
      value: dhcpData.dhcpRelayStatus,
      handleGoToPage: rowGo(() =>
        handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_L2_RELAY_STATUS),
      ),
    },
    {
      label: translator.t('popup_label_ip_address'),
      compareMatch: routerPreferencesComparison?.dhcpIpAddress,
      value: val(dhcpData.ipAddress),
      handleGoToPage: rowGo(() => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_IP_ADDRESS)),
    },
    {
      label: translator.t('popup_label_subnet_mask'),
      compareMatch: routerPreferencesComparison?.dhcpSubnetMask,
      value: val(dhcpData.subnetMask),
      handleGoToPage: rowGo(() => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_SUBNET_MASK)),
    },
    {
      label: translator.t('popup_label_start_ip'),
      compareMatch: routerPreferencesComparison?.dhcpStartIp,
      value: val(dhcpData.startIp),
      handleGoToPage: rowGo(() => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_START_IP)),
    },
    {
      label: translator.t('popup_label_end_ip'),
      compareMatch: routerPreferencesComparison?.dhcpEndIp,
      value: val(dhcpData.endIp),
      handleGoToPage: rowGo(() => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_END_IP)),
    },
    {
      label: translator.t('popup_label_isp_dns_enabled'),
      compareMatch: routerPreferencesComparison?.dhcpIspDnsEnabled,
      value: dhcpData.ispDnsEnabled,
      handleGoToPage: rowGo(() =>
        handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_ISP_DNS_STATUS),
      ),
    },
    {
      label: translator.t('popup_label_primary_dns'),
      compareMatch: routerPreferencesComparison?.dhcpPrimaryDns,
      value: val(dhcpData.primaryDns),
      handleGoToPage: rowGo(() => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_PRIMARY_DNS)),
    },
    {
      label: translator.t('popup_label_secondary_dns'),
      compareMatch: routerPreferencesComparison?.dhcpSecondaryDns,
      value: val(dhcpData.secondaryDns),
      handleGoToPage: rowGo(() =>
        handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_SECONDARY_DNS),
      ),
    },
    {
      label: translator.t('popup_label_lease_time_mode'),
      compareMatch: routerPreferencesComparison?.dhcpLeaseTimeMode,
      value: val(dhcpData.leaseTimeMode),
      handleGoToPage: rowGo(() =>
        handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_LEASE_TIME_MODE),
      ),
    },
    {
      label: translator.t('popup_label_lease_time'),
      compareMatch: routerPreferencesComparison?.dhcpLeaseTime,
      value: val(dhcpData.leaseTime),
      handleGoToPage: rowGo(() => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_LEASE_TIME)),
    },
  ];

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Network className="size-3.5" />
          {translator.t('popup_section_dhcp')}
        </span>
      }
    >
      <div className="space-y-0.5">
        {rows.map((row) => (
          <PopupDataRow
            key={row.label}
            label={row.label}
            value={row.value}
            compareMatch={row.compareMatch}
            ableToCopy={row.ableToCopy}
            handleGoToPage={row.handleGoToPage}
          />
        ))}
      </div>
    </Collapsible>
  );
};
