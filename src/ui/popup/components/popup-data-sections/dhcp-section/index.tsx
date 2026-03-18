import { val } from '@/ui/lib/utils';
import { ExtractionResult } from '@/domain/schemas/validation';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { PopupDataRow } from '../popup-data-row';
import { PopupBoolBadge } from '../popup-bool-badge';
import { Network } from 'lucide-react';

interface DhcpSectionProps {
  data: ExtractionResult;
}

export const DhcpSection = ({ data }: DhcpSectionProps) => {
  const rows: { label: string; value: string | React.ReactNode }[] = [
    { label: 'Enabled', value: <PopupBoolBadge value={data.dhcpEnabled} /> },
    { label: 'IP address', value: val(data.dhcpIpAddress) },
    { label: 'Subnet mask', value: val(data.dhcpSubnetMask) },
    { label: 'Start IP', value: val(data.dhcpStartIp) },
    { label: 'End IP', value: val(data.dhcpEndIp) },
    { label: 'ISP DNS', value: <PopupBoolBadge value={data.dhcpIspDnsEnabled} /> },
    { label: 'Primary DNS', value: val(data.dhcpPrimaryDns) },
    { label: 'Secondary DNS', value: val(data.dhcpSecondaryDns) },
    { label: 'Lease mode', value: val(data.dhcpLeaseTimeMode) },
    { label: 'Lease time', value: val(data.dhcpLeaseTime) },
  ];

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Network className="size-3.5" />
          DHCP
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
