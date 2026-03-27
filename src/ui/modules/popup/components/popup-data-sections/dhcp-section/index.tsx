import { val } from '@/ui/lib/utils';
import { ExtractionResult } from '@/domain/schemas/validation';
import { Collapsible } from '@/ui/components/ui/collapsible';
import {
  PopupDataRow,
  PopupDataRowProps,
} from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { Network } from 'lucide-react';
import { translator } from '@/infra/i18n/I18nService';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/types/router-data.types';
import { GoToPageOptions, RouterPage, RouterPageKey } from '@/application/types';

interface DhcpSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
}

export const DhcpSection = ({ data, routerPreferencesComparison, goToPage }: DhcpSectionProps) => {
  const handleGoToPage = (page: RouterPage, key: RouterPageKey) => {
    void goToPage(page, key);
  };

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_enabled'),
      compareMatch: routerPreferencesComparison?.dhcpEnabled,
      value: data.dhcpEnabled,
      handleGoToPage: () => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_STATUS),
    },
    {
      label: translator.t('popup_label_ip_address'),
      compareMatch: routerPreferencesComparison?.dhcpIpAddress,
      value: val(data.dhcpIpAddress),
      handleGoToPage: () => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_IP_ADDRESS),
    },
    {
      label: translator.t('popup_label_subnet_mask'),
      compareMatch: routerPreferencesComparison?.dhcpSubnetMask,
      value: val(data.dhcpSubnetMask),
      handleGoToPage: () => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_SUBNET_MASK),
    },
    {
      label: translator.t('popup_label_start_ip'),
      compareMatch: routerPreferencesComparison?.dhcpStartIp,
      value: val(data.dhcpStartIp),
      handleGoToPage: () => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_START_IP),
    },
    {
      label: translator.t('popup_label_end_ip'),
      compareMatch: routerPreferencesComparison?.dhcpEndIp,
      value: val(data.dhcpEndIp),
      handleGoToPage: () => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_END_IP),
    },
    {
      label: translator.t('popup_label_isp_dns_enabled'),
      compareMatch: routerPreferencesComparison?.dhcpIspDnsEnabled,
      value: data.dhcpIspDnsEnabled,
      handleGoToPage: () => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_ISP_DNS_STATUS),
    },
    {
      label: translator.t('popup_label_primary_dns'),
      compareMatch: routerPreferencesComparison?.dhcpPrimaryDns,
      value: val(data.dhcpPrimaryDns),
      handleGoToPage: () => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_PRIMARY_DNS),
    },
    {
      label: translator.t('popup_label_secondary_dns'),
      compareMatch: routerPreferencesComparison?.dhcpSecondaryDns,
      value: val(data.dhcpSecondaryDns),
      handleGoToPage: () => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_SECONDARY_DNS),
    },
    {
      label: translator.t('popup_label_lease_time_mode'),
      compareMatch: routerPreferencesComparison?.dhcpLeaseTimeMode,
      value: val(data.dhcpLeaseTimeMode),
      handleGoToPage: () => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_LEASE_TIME_MODE),
    },
    {
      label: translator.t('popup_label_lease_time'),
      compareMatch: routerPreferencesComparison?.dhcpLeaseTime,
      value: val(data.dhcpLeaseTime),
      handleGoToPage: () => handleGoToPage(RouterPage.DHCP, RouterPageKey.DHCP_LEASE_TIME),
    },
  ];

  const hasData = rows.some(
    (row) => row.value !== undefined && row.value !== null && row.value !== '-',
  );

  return (
    <Collapsible
      defaultOpen={hasData}
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
