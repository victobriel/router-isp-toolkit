import { Collapsible } from '@/ui/components/ui/collapsible';
import { Server } from 'lucide-react';
import { PopupDataRow } from '../popup-data-row';
import { PopupBoolBadge } from '../popup-bool-badge';
import { ExtractionResult } from '@/domain/schemas/validation';

interface RemoteAccessSectionProps {
  data: ExtractionResult;
}

export const RemoteAccessSection = ({ data }: RemoteAccessSectionProps) => {
  const rows: { label: string; value: string | React.ReactNode }[] = [
    { label: 'IPv4', value: <PopupBoolBadge value={data.remoteAccessIpv4Enabled} /> },
    { label: 'IPv6', value: <PopupBoolBadge value={data.remoteAccessIpv6Enabled} /> },
  ];

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Server className="size-3.5" />
          Remote Access
        </span>
      }
    >
      <div className="space-y-0.5">
        {rows.map((row) => {
          return <PopupDataRow key={row.label} label={row.label} value={row.value} />;
        })}
      </div>
    </Collapsible>
  );
};
