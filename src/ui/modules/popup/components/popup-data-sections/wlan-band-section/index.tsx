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
import type { RouterPreferencesComparison } from '@/ui/modules/popup/types/router-data.types';
import { GoToPageOptions, RouterPage, RouterPageKey } from '@/application/types';

/** SSID list from extraction; same element shape for 2.4 GHz and 5 GHz. */
type WlanExtractedSsidList = NonNullable<ExtractionResult['wlan24GhzSsids']>;

interface WlanSsidSliderProps {
  band: Band;
  ssids: WlanExtractedSsidList;
  ssidMatches?: Array<{
    ssidName: boolean | undefined;
    ssidHideMode: boolean | undefined;
    wpa2SecurityType: boolean | undefined;
    maxClients: boolean | undefined;
  }>;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
}

export const WlanSsidSlider = ({ band, ssids, ssidMatches, goToPage }: WlanSsidSliderProps) => {
  const [idx, setIdx] = useState(0);
  const ssid = ssids[idx];

  if (!ssid) return null;

  const handleGoToPage = (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => {
    void goToPage(page, key, options);
  };
  const ssidIndex = (band === Band.GHz5 ? 4 : 0) + idx;
  const ssidOptions: GoToPageOptions = { band, ssidIndex };

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_enabled'),
      value: ssid.enabled,
      handleGoToPage: () =>
        handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_SSID_STATUS, ssidOptions),
    },
    {
      label: translator.t('popup_label_ssid_name'),
      compareMatch: ssidMatches?.[idx]?.ssidName,
      value: val(ssid.ssidName),
      ableToCopy: true,
      handleGoToPage: () =>
        handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_SSID_NAME, ssidOptions),
    },
    {
      label: translator.t('popup_label_ssid_password'),
      value: val(ssid.ssidPassword),
      ableToCopy: true,
      handleGoToPage: () =>
        handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_SSID_PASSWORD, ssidOptions),
    },
    {
      label: translator.t('popup_label_ssid_hide_mode'),
      compareMatch: ssidMatches?.[idx]?.ssidHideMode,
      value: ssid.ssidHideMode,
      handleGoToPage: () =>
        handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_SSID_HIDE_MODE_STATUS, ssidOptions),
    },
    {
      label: translator.t('popup_label_wpa2_security'),
      compareMatch: ssidMatches?.[idx]?.wpa2SecurityType,
      value: val(ssid.wpa2SecurityType),
      handleGoToPage: () =>
        handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_WPA2_SECURITY_TYPE, ssidOptions),
    },
    {
      label: translator.t('popup_label_max_clients'),
      compareMatch: ssidMatches?.[idx]?.maxClients,
      value: val(String(ssid.maxClients)),
      handleGoToPage: () =>
        handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_MAX_CLIENTS, ssidOptions),
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
            handleGoToPage={row.handleGoToPage}
          />
        );
      })}
    </div>
  );
};

interface WlanBandSectionProps {
  band: Band;
  config: ExtractionResult['wlan24GhzConfig'] | ExtractionResult['wlan5GhzConfig'];
  ssids: ExtractionResult['wlan24GhzSsids'] | ExtractionResult['wlan5GhzSsids'];
  totalClients: number;
  routerPreferencesComparison: RouterPreferencesComparison | null;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
}

export const WlanBandSection = ({
  band,
  config,
  ssids,
  totalClients,
  routerPreferencesComparison,
  goToPage,
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

  const channelMatch =
    band === Band.GHz24
      ? routerPreferencesComparison?.wlan24GhzChannel
      : routerPreferencesComparison?.wlan5GhzChannel;
  const modeMatch =
    band === Band.GHz24
      ? routerPreferencesComparison?.wlan24GhzMode
      : routerPreferencesComparison?.wlan5GhzMode;
  const bandWidthMatch =
    band === Band.GHz24
      ? routerPreferencesComparison?.wlan24GhzBandWidth
      : routerPreferencesComparison?.wlan5GhzBandWidth;
  const transmittingPowerMatch =
    band === Band.GHz24
      ? routerPreferencesComparison?.wlan24GhzTransmittingPower
      : routerPreferencesComparison?.wlan5GhzTransmittingPower;

  const handleGoToPage = (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => {
    void goToPage(page, key, options);
  };

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_radio'),
      compareMatch: radioEnabledMatch,
      value: config?.enabled,
      handleGoToPage: () => handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_STATUS, { band }),
    },
    {
      label: translator.t('popup_label_channel'),
      compareMatch: channelMatch,
      value: val(config?.channel),
      handleGoToPage: () => handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_CHANNEL, { band }),
    },
    {
      label: translator.t('popup_label_mode'),
      compareMatch: modeMatch,
      value: val(config?.mode),
      handleGoToPage: () => handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_MODE, { band }),
    },
    {
      label: translator.t('popup_label_bandwidth'),
      compareMatch: bandWidthMatch,
      value: val(config?.bandWidth),
      handleGoToPage: () => handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_BANDWIDTH, { band }),
    },
    {
      label: translator.t('popup_label_transmitting_power'),
      compareMatch: transmittingPowerMatch,
      value: val(config?.transmittingPower),
      handleGoToPage: () =>
        handleGoToPage(RouterPage.WLAN, RouterPageKey.WLAN_TRANSMITTING_POWER, { band }),
    },
  ];

  const hasData = rows.some((row) => row.value !== undefined && row.value !== null);

  return (
    <Collapsible
      defaultOpen={hasData}
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
              handleGoToPage={row.handleGoToPage}
            />
          );
        })}
        {ssids && ssids.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <WlanSsidSlider
              band={band}
              ssids={ssids}
              ssidMatches={ssidMatches}
              goToPage={goToPage}
            />
          </>
        )}
      </div>
    </Collapsible>
  );
};
