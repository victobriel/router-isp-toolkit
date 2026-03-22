import { ExtractionResult } from '@/domain/schemas/validation';
import { Badge } from '@/ui/components/ui/badge';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { ChevronLeft, ChevronRight, Wifi } from 'lucide-react';
import {
  PopupDataRow,
  PopupDataRowProps,
} from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { val } from '@/ui/lib/utils';
import { Separator } from '@/ui/components/ui/separator';
import { useState } from 'react';
import { Band } from '@/ui/types';
import { translator } from '@/infra/i18n/I18nService';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/components/popup-data-provider';

interface WlanSsidSliderProps {
  ssids: NonNullable<ExtractionResult['wlan24GhzSsids']>;
  ssidMatches?: Array<{
    ssidName: boolean | undefined;
    ssidHideMode: boolean | undefined;
    wpa2SecurityType: boolean | undefined;
    maxClients: boolean | undefined;
  }>;
}

export const WlanSsidSlider = ({ ssids, ssidMatches }: WlanSsidSliderProps) => {
  const [idx, setIdx] = useState(0);
  const ssid = ssids[idx];

  if (!ssid) return null;

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_enabled'),
      compareMatch: ssid.enabled,
      value: ssid.enabled,
    },
    {
      label: translator.t('popup_label_ssid_name'),
      compareMatch: ssidMatches?.[idx]?.ssidName,
      value: val(ssid.ssidName),
      ableToCopy: true,
    },
    {
      label: translator.t('popup_label_ssid_password'),
      value: val(ssid.ssidPassword),
      ableToCopy: true,
    },
    {
      label: translator.t('popup_label_ssid_hide_mode'),
      compareMatch: ssidMatches?.[idx]?.ssidHideMode,
      value: ssid.ssidHideMode,
    },
    {
      label: translator.t('popup_label_wpa2_security'),
      compareMatch: ssidMatches?.[idx]?.wpa2SecurityType,
      value: val(ssid.wpa2SecurityType),
    },
    {
      label: translator.t('popup_label_max_clients'),
      compareMatch: ssidMatches?.[idx]?.maxClients,
      value: val(String(ssid.maxClients)),
    },
  ];

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between mb-1 h-9">
        <span className="text-xs text-muted-foreground">
          {translator.t('popup_label_ssid')} {idx + 1} / {ssids.length}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded flex items-center justify-center hover:bg-muted disabled:opacity-40"
            disabled={idx === 0}
            onClick={() => setIdx((i) => i - 1)}
            aria-label={translator.t('popup_aria_previous_ssid')}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            className="rounded flex items-center justify-center hover:bg-muted disabled:opacity-40"
            disabled={idx === ssids.length - 1}
            onClick={() => setIdx((i) => i + 1)}
            aria-label={translator.t('popup_aria_next_ssid')}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
      {rows.map((row) => {
        return (
          <PopupDataRow
            key={row.label}
            label={row.label}
            value={row.value}
            compareMatch={row.compareMatch}
            ableToCopy={row.ableToCopy}
          />
        );
      })}
    </div>
  );
};

interface WlanBandSectionProps {
  band: Band;
  config: ExtractionResult['wlan24GhzConfig'];
  ssids: ExtractionResult['wlan24GhzSsids'];
  totalClients: number;
  routerPreferencesComparison: RouterPreferencesComparison | null;
}

export const WlanBandSection = ({
  band,
  config,
  ssids,
  totalClients,
  routerPreferencesComparison,
}: WlanBandSectionProps) => {
  const radioEnabledMatch =
    band === Band.GHz24
      ? routerPreferencesComparison?.wlan24GhzRadioEnabled
      : routerPreferencesComparison?.wlan5GhzRadioEnabled;

  const ssidMatches =
    band === Band.GHz24
      ? routerPreferencesComparison?.wlan24GhzSsids?.map((s) => ({
          ssidName: s.ssidName,
          ssidHideMode: s.ssidHideMode,
          wpa2SecurityType: s.wpa2SecurityType,
          maxClients: s.maxClients,
        }))
      : routerPreferencesComparison?.wlan5GhzSsids?.map((s) => ({
          ssidName: s.ssidName,
          ssidHideMode: s.ssidHideMode,
          wpa2SecurityType: s.wpa2SecurityType,
          maxClients: s.maxClients,
        }));

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_radio'),
      compareMatch: radioEnabledMatch,
      value: config?.enabled,
    },
    {
      label: translator.t('popup_label_channel'),
      compareMatch: routerPreferencesComparison?.wlan24GhzChannel,
      value: val(config?.channel),
    },
    {
      label: translator.t('popup_label_mode'),
      compareMatch: routerPreferencesComparison?.wlan24GhzMode,
      value: val(config?.mode),
    },
    {
      label: translator.t('popup_label_bandwidth'),
      compareMatch: routerPreferencesComparison?.wlan24GhzBandWidth,
      value: val(config?.bandWidth),
    },
    {
      label: translator.t('popup_label_transmitting_power'),
      compareMatch: routerPreferencesComparison?.wlan24GhzTransmittingPower,
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
          return (
            <PopupDataRow
              key={row.label}
              label={row.label}
              value={row.value}
              compareMatch={row.compareMatch}
              ableToCopy={row.ableToCopy}
            />
          );
        })}
        {ssids && ssids.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <WlanSsidSlider ssids={ssids} ssidMatches={ssidMatches} />
          </>
        )}
      </div>
    </Collapsible>
  );
};
