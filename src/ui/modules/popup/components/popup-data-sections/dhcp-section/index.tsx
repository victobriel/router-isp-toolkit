import { val } from '@/ui/lib/utils';
import { ExtractionResult } from '@/domain/schemas/validation';
import { Collapsible } from '@/ui/components/ui/collapsible';
import {
  PopupDataRow,
  PopupDataRowProps,
} from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { Network } from 'lucide-react';
import { translator } from '@/infra/i18n/I18nService';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/components/popup-data-provider';

interface DhcpSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
}

export const DhcpSection = ({ data, routerPreferencesComparison }: DhcpSectionProps) => {
  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_enabled'),
      compareMatch: routerPreferencesComparison?.dhcpEnabled,
      value: data.dhcpEnabled,
    },
    {
      label: translator.t('popup_label_ip_address'),
      compareMatch: routerPreferencesComparison?.dhcpIpAddress,
      value: val(data.dhcpIpAddress),
    },
    {
      label: translator.t('popup_label_subnet_mask'),
      compareMatch: routerPreferencesComparison?.dhcpSubnetMask,
      value: val(data.dhcpSubnetMask),
    },
    {
      label: translator.t('popup_label_start_ip'),
      compareMatch: routerPreferencesComparison?.dhcpStartIp,
      value: val(data.dhcpStartIp),
    },
    {
      label: translator.t('popup_label_end_ip'),
      compareMatch: routerPreferencesComparison?.dhcpEndIp,
      value: val(data.dhcpEndIp),
    },
    {
      label: translator.t('popup_label_isp_dns_enabled'),
      compareMatch: routerPreferencesComparison?.dhcpIspDnsEnabled,
      value: data.dhcpIspDnsEnabled,
    },
    {
      label: translator.t('popup_label_primary_dns'),
      compareMatch: routerPreferencesComparison?.dhcpPrimaryDns,
      value: val(data.dhcpPrimaryDns),
    },
    {
      label: translator.t('popup_label_secondary_dns'),
      compareMatch: routerPreferencesComparison?.dhcpSecondaryDns,
      value: val(data.dhcpSecondaryDns),
    },
    {
      label: translator.t('popup_label_lease_time_mode'),
      compareMatch: routerPreferencesComparison?.dhcpLeaseTimeMode,
      value: val(data.dhcpLeaseTimeMode),
    },
    {
      label: translator.t('popup_label_lease_time'),
      compareMatch: routerPreferencesComparison?.dhcpLeaseTime,
      value: val(data.dhcpLeaseTime),
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
          />
        ))}
      </div>
    </Collapsible>
  );
};
