import { ExtractionResult } from '@/domain/schemas/validation';
import { Badge } from '@/ui/components/ui/badge';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { ChevronLeft, ChevronRight, Wifi } from 'lucide-react';
import { PopupDataRow } from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { PopupBoolBadge } from '@/ui/modules/popup/components/popup-data-sections/popup-bool-badge';
import { val } from '@/ui/lib/utils';
import { Separator } from '@/ui/components/ui/separator';
import { useState } from 'react';
import { Band } from '@/ui/types';
import { translator } from '@/infra/i18n/I18nService';

interface WlanSsidSliderProps {
  ssids: NonNullable<ExtractionResult['wlan24GhzSsids']>;
}

export const WlanSsidSlider = ({ ssids }: WlanSsidSliderProps) => {
  const [idx, setIdx] = useState(0);
  const ssid = ssids[idx];

  if (!ssid) return null;

  const rows: { label: string; value: string | React.ReactNode }[] = [
    { label: translator.t('popup_label_enabled'), value: <PopupBoolBadge value={ssid.enabled} /> },
    { label: translator.t('popup_label_ssid_name'), value: val(ssid.ssidName) },
    { label: translator.t('popup_label_ssid_password'), value: val(ssid.ssidPassword) },
    {
      label: translator.t('popup_label_ssid_hide_mode'),
      value: <PopupBoolBadge value={ssid.ssidHideMode} />,
    },
    { label: translator.t('popup_label_wpa2_security'), value: val(ssid.wpa2SecurityType) },
    { label: translator.t('popup_label_max_clients'), value: String(ssid.maxClients) },
  ];

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">
          {translator.t('popup_label_ssid')} {idx + 1} / {ssids.length}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            className="size-5 rounded flex items-center justify-center hover:bg-muted disabled:opacity-40"
            disabled={idx === 0}
            onClick={() => setIdx((i) => i - 1)}
            aria-label={translator.t('popup_aria_previous_ssid')}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            className="size-5 rounded flex items-center justify-center hover:bg-muted disabled:opacity-40"
            disabled={idx === ssids.length - 1}
            onClick={() => setIdx((i) => i + 1)}
            aria-label={translator.t('popup_aria_next_ssid')}
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
    { label: translator.t('popup_label_radio'), value: <PopupBoolBadge value={config?.enabled} /> },
    { label: translator.t('popup_label_channel'), value: val(config?.channel) },
    { label: translator.t('popup_label_mode'), value: val(config?.mode) },
    { label: translator.t('popup_label_bandwidth'), value: val(config?.bandWidth) },
    {
      label: translator.t('popup_label_transmitting_power'),
      value: val(config?.transmittingPower),
    },
  ];

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Wifi className="size-3.5" />
          {band === Band.GHz24
            ? translator.t('popup_section_wlan_24')
            : translator.t('popup_section_wlan_5')}
        </span>
      }
      headerExtra={
        <Badge variant="outline" className="text-sm px-1.5 py-0 ml-1">
          {totalClients} {translator.t('popup_label_ssid_total_clients')}
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
