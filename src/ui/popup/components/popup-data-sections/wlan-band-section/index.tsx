import { ExtractionResult } from '@/domain/schemas/validation';
import { Badge } from '@/ui/components/ui/badge';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { ChevronLeft, ChevronRight, Wifi } from 'lucide-react';
import { PopupDataRow } from '../popup-data-row';
import { PopupBoolBadge } from '../popup-bool-badge';
import { val } from '@/ui/lib/utils';
import { Separator } from '@/ui/components/ui/separator';
import { useState } from 'react';
import { Band } from '@/ui/types';

interface WlanSsidSliderProps {
  ssids: NonNullable<ExtractionResult['wlan24GhzSsids']>;
}

export const WlanSsidSlider = ({ ssids }: WlanSsidSliderProps) => {
  const [idx, setIdx] = useState(0);
  const ssid = ssids[idx];

  if (!ssid) return null;

  const rows: { label: string; value: string | React.ReactNode }[] = [
    { label: 'Enabled', value: <PopupBoolBadge value={ssid.enabled} /> },
    { label: 'Name', value: val(ssid.ssidName) },
    { label: 'Password', value: val(ssid.ssidPassword) },
    { label: 'Hidden', value: <PopupBoolBadge value={ssid.ssidHideMode} /> },
    { label: 'Security', value: val(ssid.wpa2SecurityType) },
    { label: 'Max clients', value: String(ssid.maxClients) },
  ];

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">
          SSID {idx + 1} / {ssids.length}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            className="size-5 rounded flex items-center justify-center hover:bg-muted disabled:opacity-40"
            disabled={idx === 0}
            onClick={() => setIdx((i) => i - 1)}
            aria-label="Previous SSID"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            className="size-5 rounded flex items-center justify-center hover:bg-muted disabled:opacity-40"
            disabled={idx === ssids.length - 1}
            onClick={() => setIdx((i) => i + 1)}
            aria-label="Next SSID"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      {rows.map((row) => {
        return <PopupDataRow key={row.label} label={row.label} value={row.value} />;
      })}
    </div>
  );
};

interface WlanBandSectionProps {
  band: Band;
  config: ExtractionResult['wlan24GhzConfig'];
  ssids: ExtractionResult['wlan24GhzSsids'];
  totalClients: number;
}

export const WlanBandSection = ({ band, config, ssids, totalClients }: WlanBandSectionProps) => {
  const rows: { label: string; value: string | React.ReactNode }[] = [
    { label: 'Radio', value: <PopupBoolBadge value={config?.enabled} /> },
    { label: 'Channel', value: val(config?.channel) },
    { label: 'Mode', value: val(config?.mode) },
    { label: 'Bandwidth', value: val(config?.bandWidth) },
    { label: 'TX power', value: val(config?.transmittingPower) },
  ];

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Wifi className="size-3.5" />
          WLAN {band}
        </span>
      }
      headerExtra={
        <Badge variant="outline" className="text-sm px-1.5 py-0 ml-1">
          {totalClients} clients
        </Badge>
      }
    >
      <div className="space-y-0.5">
        {rows.map((row) => {
          return <PopupDataRow key={row.label} label={row.label} value={row.value} />;
        })}
        {ssids && ssids.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <WlanSsidSlider ssids={ssids} />
          </>
        )}
      </div>
    </Collapsible>
  );
};
