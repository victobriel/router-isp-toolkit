import { ExtractionResult } from '@/domain/schemas/validation';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { val } from '@/ui/lib/utils';
import { Router } from 'lucide-react';
import { PopupBoolBadge } from '../popup-bool-badge';
import { PopupDataRow } from '../popup-data-row';

interface MiscSectionProps {
  data: ExtractionResult;
}

export const MiscSection = ({ data }: MiscSectionProps) => {
  const rows: { label: string; value: string | React.ReactNode }[] = [
    { label: 'Version', value: val(data.routerVersion) },
    { label: 'TR-069 URL', value: val(data.tr069Url) },
    { label: 'UPnP', value: <PopupBoolBadge value={data.upnpEnabled} /> },
    { label: 'Band steering', value: <PopupBoolBadge value={data.bandSteeringEnabled} /> },
  ];

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Router className="size-3.5" />
          Router Info
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
