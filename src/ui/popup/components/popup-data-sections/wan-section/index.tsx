import { ExtractionResult } from '@/domain/schemas/validation';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { Network } from 'lucide-react';
import { PopupDataRow } from '@/ui/popup/components/popup-data-sections/popup-data-row';
import { PopupBoolBadge } from '../popup-bool-badge';
import { val } from '@/ui/lib/utils';
import { Separator } from '@/ui/components/ui/separator';

interface WanSectionProps {
  data: ExtractionResult;
}

export const WanSection = ({ data }: WanSectionProps) => {
  const rows: { label: string; value: string | React.ReactNode }[] = [
    { label: 'PPPoE username', value: val(data.pppoeUsername) },
    { label: 'Internet', value: <PopupBoolBadge value={data.internetEnabled} /> },
    { label: 'TR-069', value: <PopupBoolBadge value={data.tr069Enabled} /> },
    { label: 'Link speed', value: val(data.linkSpeed) },
    { label: 'IP version', value: val(data.ipVersion ?? undefined) },
  ];
  if (data.ipVersion?.includes('6')) {
    rows.push(
      { label: 'Request PD', value: <PopupBoolBadge value={data.requestPdEnabled} /> },
      { label: 'SLAAC', value: <PopupBoolBadge value={data.slaacEnabled} /> },
      { label: 'DHCPv6', value: <PopupBoolBadge value={data.dhcpv6Enabled} /> },
      { label: 'PD', value: <PopupBoolBadge value={data.pdEnabled} /> },
    );
  }

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Network className="size-3.5" />
          WAN
        </span>
      }
    >
      <div className="space-y-0.5">
        {rows.map((row, index) => (
          <div key={row.label}>
            {index === 5 && <Separator key={`separator-${index}`} className="my-1" />}
            <PopupDataRow key={row.label} label={row.label} value={row.value} />
          </div>
        ))}
      </div>
    </Collapsible>
  );
};
