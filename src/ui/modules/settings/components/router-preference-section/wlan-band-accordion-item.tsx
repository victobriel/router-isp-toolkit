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
} from './pref-fields';
import { SetStateAction, Dispatch, useMemo } from 'react';
import { Band } from '@/ui/types';

type Props = {
  accordionValue: Band;
  title: string;
  localPrefs: RouterPreferencesStore;
  setLocalPrefs: Dispatch<SetStateAction<RouterPreferencesStore>>;
};

enum WlanBandKeys {
  GHz24 = 'wlan24GhzConfig',
  GHz5 = 'wlan5GhzConfig',
}

enum WlanSsidKeys {
  GHz24 = 'wlan24GhzSsids',
  GHz5 = 'wlan5GhzSsids',
}

export function WlanBandAccordionItem({ accordionValue, title, localPrefs, setLocalPrefs }: Props) {
  const isWlan24 = accordionValue === Band.GHz24;
  const bandKey = isWlan24 ? WlanBandKeys.GHz24 : WlanBandKeys.GHz5;
  const ssidsKey = isWlan24 ? WlanSsidKeys.GHz24 : WlanSsidKeys.GHz5;
  const cfg = localPrefs[bandKey];
  const ssid = localPrefs[ssidsKey];

  const patchWlan = (patch: NonNullable<RouterPreferencesStore[typeof bandKey]>) => {
    setLocalPrefs((prev) => ({
      ...prev,
      [bandKey]: { ...prev[bandKey], ...patch },
    }));
  };

  const patchSsid = (patch: NonNullable<RouterPreferencesStore[typeof ssidsKey]>) => {
    setLocalPrefs((prev) => ({
      ...prev,
      [ssidsKey]: { ...prev[ssidsKey], ...patch },
    }));
  };

  const {
    channelAcceptable,
    channelPlaceholder,
    bandWidthAcceptable,
    bandWidthPlaceholder,
    statusLabel,
    channelLabel,
    modeLabel,
    bwLabel,
    powerLabel,
  } = useMemo(
    () => ({
      channelAcceptable: isWlan24 ? WLAN24_CHANNEL_ACCEPTABLE : WLAN5_80MHZ_CHANNELS,
      channelPlaceholder: isWlan24 ? 'Auto, 1-13' : 'Auto, 36, 40, 44, 48, 149...',
      bandWidthAcceptable: isWlan24 ? WLAN24_BAND_WIDTH : WLAN5_BAND_WIDTH,
      bandWidthPlaceholder: isWlan24 ? 'Auto, 20MHz, 40MHz' : 'Auto, 20MHz, 40MHz, 80MHz, 160MHz',
      statusLabel: isWlan24
        ? translator.t('settings_pref_wlan_24_status')
        : translator.t('settings_pref_wlan_5_status'),
      channelLabel: isWlan24
        ? translator.t('settings_pref_wlan_24_channel')
        : translator.t('settings_pref_wlan_5_channel'),
      modeLabel: isWlan24
        ? translator.t('settings_pref_wlan_24_mode')
        : translator.t('settings_pref_wlan_5_mode'),
      bwLabel: isWlan24
        ? translator.t('settings_pref_wlan_24_band_width')
        : translator.t('settings_pref_wlan_5_band_width'),
      powerLabel: isWlan24
        ? translator.t('settings_pref_wlan_24_transmitting_power')
        : translator.t('settings_pref_wlan_5_transmitting_power'),
    }),
    [isWlan24],
  );

  return (
    <AccordionItem value={accordionValue} className="border-b-0">
      <AccordionTrigger className="text-sm py-3 hover:no-underline">{title}</AccordionTrigger>
      <AccordionContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BoolSelectPref
            label={statusLabel}
            value={cfg?.enabled}
            onChange={(next) => patchWlan({ enabled: next })}
            dataField={`${bandKey}.enabled`}
          />
          <TagListPref
            label={channelLabel}
            value={cfg?.channel ?? []}
            onChange={(v) => patchWlan({ channel: v })}
            dataField={`${bandKey}.channel`}
            acceptableValues={channelAcceptable}
            placeholder={channelPlaceholder}
          />
          <TextPref
            label={modeLabel}
            value={cfg?.mode ?? ''}
            onChange={(v) => patchWlan({ mode: v })}
            dataField={`${bandKey}.mode`}
          />
          <TagListPref
            label={bwLabel}
            value={cfg?.bandWidth ?? []}
            onChange={(v) => patchWlan({ bandWidth: v })}
            dataField={`${bandKey}.bandWidth`}
            acceptableValues={bandWidthAcceptable}
            placeholder={bandWidthPlaceholder}
          />
          <SelectPref
            label={powerLabel}
            value={wlanTransmittingPowerToSelectValue(cfg?.transmittingPower)}
            onChange={(v) =>
              patchWlan({
                transmittingPower: wlanTransmittingPowerSelectToStored(v),
              })
            }
            dataField={`${bandKey}.transmittingPower`}
            items={WLAN_TRANSMITTING_POWER_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextPref
            label={translator.t('popup_label_ssid_name')}
            value={asTextFieldValue(ssid?.ssidName)}
            onChange={(v) => patchSsid({ ssidName: v })}
            dataField={`${ssidsKey}.ssidName`}
          />
          <BoolSelectPref
            label={translator.t('popup_label_ssid_hide_mode')}
            value={ssid?.ssidHideMode}
            onChange={(next) => patchSsid({ ssidHideMode: next })}
            dataField={`${ssidsKey}.ssidHideMode`}
          />
          <TextPref
            label={translator.t('popup_label_wpa2_security')}
            value={ssid?.wpa2SecurityType ?? ''}
            onChange={(v) => patchSsid({ wpa2SecurityType: v })}
            dataField={`${ssidsKey}.wpa2SecurityType`}
          />
          <TextPref
            label={translator.t('popup_label_max_clients')}
            value={asTextFieldValue(ssid?.maxClients)}
            onChange={(v) => patchSsid({ maxClients: v })}
            dataField={`${ssidsKey}.maxClients`}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
