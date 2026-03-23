import type { RouterPreferencesStore } from '@/application/types';
import { translator } from '@/infra/i18n/I18nService';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/components/ui/accordion';
import {
  WLAN24_BAND_WIDTH,
  WLAN24_CHANNEL_ACCEPTABLE,
  WLAN5_80MHZ_CHANNELS,
  WLAN5_BAND_WIDTH,
  WLAN_TRANSMITTING_POWER_OPTIONS,
} from './constants';
import {
  BoolSelectPref,
  SelectPref,
  TagListPref,
  TextPref,
  asTextFieldValue,
  wlanTransmittingPowerSelectToStored,
  wlanTransmittingPowerToSelectValue,
  type WlanBand,
  type WlanSsidPrefs,
} from './pref-fields';

type Props = {
  accordionValue: string;
  title: string;
  band: WlanBand;
  ssids: WlanSsidPrefs;
  variant: 'wlan24' | 'wlan5';
  localPrefs: RouterPreferencesStore;
  patchWlan: (b: WlanBand, patch: NonNullable<RouterPreferencesStore[WlanBand]>) => void;
  patchSsid: (
    key: WlanSsidPrefs,
    patch: NonNullable<RouterPreferencesStore[WlanSsidPrefs]>,
  ) => void;
};

export function WlanBandAccordionItem({
  accordionValue,
  title,
  band,
  ssids,
  variant,
  localPrefs,
  patchWlan,
  patchSsid,
}: Props) {
  const cfg = localPrefs[band];
  const ssid = localPrefs[ssids];

  const channelAcceptable = variant === 'wlan24' ? WLAN24_CHANNEL_ACCEPTABLE : WLAN5_80MHZ_CHANNELS;
  const channelPlaceholder = variant === 'wlan24' ? 'Auto, 1-13' : 'Auto, 36, 40, 44, 48, 149...';
  const bandWidthAcceptable = variant === 'wlan24' ? WLAN24_BAND_WIDTH : WLAN5_BAND_WIDTH;
  const bandWidthPlaceholder =
    variant === 'wlan24' ? 'Auto, 20MHz, 40MHz' : 'Auto, 20MHz, 40MHz, 80MHz, 160MHz';

  const statusLabel =
    variant === 'wlan24'
      ? translator.t('settings_pref_wlan_24_status')
      : translator.t('settings_pref_wlan_5_status');
  const channelLabel =
    variant === 'wlan24'
      ? translator.t('settings_pref_wlan_24_channel')
      : translator.t('settings_pref_wlan_5_channel');
  const modeLabel =
    variant === 'wlan24'
      ? translator.t('settings_pref_wlan_24_mode')
      : translator.t('settings_pref_wlan_5_mode');
  const bwLabel =
    variant === 'wlan24'
      ? translator.t('settings_pref_wlan_24_band_width')
      : translator.t('settings_pref_wlan_5_band_width');
  const powerLabel =
    variant === 'wlan24'
      ? translator.t('settings_pref_wlan_24_transmitting_power')
      : translator.t('settings_pref_wlan_5_transmitting_power');

  return (
    <AccordionItem value={accordionValue} className="border-b-0">
      <AccordionTrigger className="text-sm py-3 hover:no-underline">{title}</AccordionTrigger>
      <AccordionContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BoolSelectPref
            label={statusLabel}
            value={cfg?.enabled}
            onChange={(next) => patchWlan(band, { enabled: next })}
            dataField={`${band}.enabled`}
          />
          <TagListPref
            label={channelLabel}
            value={cfg?.channel ?? []}
            onChange={(v) => patchWlan(band, { channel: v })}
            dataField={`${band}.channel`}
            acceptableValues={channelAcceptable}
            placeholder={channelPlaceholder}
          />
          <TextPref
            label={modeLabel}
            value={cfg?.mode ?? ''}
            onChange={(v) => patchWlan(band, { mode: v })}
            dataField={`${band}.mode`}
          />
          <TagListPref
            label={bwLabel}
            value={cfg?.bandWidth ?? []}
            onChange={(v) => patchWlan(band, { bandWidth: v })}
            dataField={`${band}.bandWidth`}
            acceptableValues={bandWidthAcceptable}
            placeholder={bandWidthPlaceholder}
          />
          <SelectPref
            label={powerLabel}
            value={wlanTransmittingPowerToSelectValue(cfg?.transmittingPower)}
            onChange={(v) =>
              patchWlan(band, {
                transmittingPower: wlanTransmittingPowerSelectToStored(v),
              })
            }
            dataField={`${band}.transmittingPower`}
            items={WLAN_TRANSMITTING_POWER_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextPref
            label={translator.t('popup_label_ssid_name')}
            value={asTextFieldValue(ssid?.ssidName)}
            onChange={(v) => patchSsid(ssids, { ssidName: v })}
            dataField={`${ssids}.ssidName`}
          />
          <BoolSelectPref
            label={translator.t('popup_label_ssid_hide_mode')}
            value={ssid?.ssidHideMode}
            onChange={(next) => patchSsid(ssids, { ssidHideMode: next })}
            dataField={`${ssids}.ssidHideMode`}
          />
          <TextPref
            label={translator.t('popup_label_wpa2_security')}
            value={ssid?.wpa2SecurityType ?? ''}
            onChange={(v) => patchSsid(ssids, { wpa2SecurityType: v })}
            dataField={`${ssids}.wpa2SecurityType`}
          />
          <TextPref
            label={translator.t('popup_label_max_clients')}
            value={asTextFieldValue(ssid?.maxClients)}
            onChange={(v) => patchSsid(ssids, { maxClients: v })}
            dataField={`${ssids}.maxClients`}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
