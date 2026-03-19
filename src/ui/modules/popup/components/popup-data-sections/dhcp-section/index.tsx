import { val } from '@/ui/lib/utils';
import { ExtractionResult } from '@/domain/schemas/validation';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { PopupDataRow } from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { PopupBoolBadge } from '@/ui/modules/popup/components/popup-data-sections/popup-bool-badge';
import { Network } from 'lucide-react';
import { translator } from '@/infra/i18n/I18nService';

interface DhcpSectionProps {
  data: ExtractionResult;
}

export const DhcpSection = ({ data }: DhcpSectionProps) => {
  const rows: { label: string; value: string | React.ReactNode }[] = [
    {
      label: translator.t('popup_label_enabled'),
      value: <PopupBoolBadge value={data.dhcpEnabled} />,
    },
    { label: translator.t('popup_label_ip_address'), value: val(data.dhcpIpAddress) },
    { label: translator.t('popup_label_subnet_mask'), value: val(data.dhcpSubnetMask) },
    { label: translator.t('popup_label_start_ip'), value: val(data.dhcpStartIp) },
    { label: translator.t('popup_label_end_ip'), value: val(data.dhcpEndIp) },
    {
      label: translator.t('popup_label_isp_dns_enabled'),
      value: <PopupBoolBadge value={data.dhcpIspDnsEnabled} />,
    },
    { label: translator.t('popup_label_primary_dns'), value: val(data.dhcpPrimaryDns) },
    { label: translator.t('popup_label_secondary_dns'), value: val(data.dhcpSecondaryDns) },
    { label: translator.t('popup_label_lease_time_mode'), value: val(data.dhcpLeaseTimeMode) },
    { label: translator.t('popup_label_lease_time'), value: val(data.dhcpLeaseTime) },
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
          <PopupDataRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </Collapsible>
  );
};
