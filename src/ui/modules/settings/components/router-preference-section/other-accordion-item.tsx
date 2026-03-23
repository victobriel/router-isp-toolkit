import type { RouterPreferencesStore } from '@/application/types';
import { translator } from '@/infra/i18n/I18nService';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/components/ui/accordion';
import type { Dispatch, SetStateAction } from 'react';
import { BoolSelectPref, TextPref } from './pref-fields';

type Props = {
  localPrefs: RouterPreferencesStore;
  setLocalPrefs: Dispatch<SetStateAction<RouterPreferencesStore>>;
};

export function OtherAccordionItem({ localPrefs, setLocalPrefs }: Props) {
  return (
    <AccordionItem value="other" className="border-b-0">
      <AccordionTrigger className="text-sm py-3 hover:no-underline">
        {translator.t('settings_prefs_other_summary')}
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextPref
            label={translator.t('popup_label_link_speed')}
            value={localPrefs.linkSpeed ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, linkSpeed: v }))}
            dataField="linkSpeed"
          />
          <TextPref
            label={translator.t('popup_label_version')}
            value={localPrefs.routerVersion ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, routerVersion: v }))}
            dataField="routerVersion"
          />
          <TextPref
            label={translator.t('settings_pref_tr069_url')}
            value={localPrefs.tr069Url ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, tr069Url: v }))}
            dataField="tr069Url"
          />
          <TextPref
            label={translator.t('settings_pref_pppoe_username')}
            value={localPrefs.pppoeUsername ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, pppoeUsername: v }))}
            dataField="pppoeUsername"
          />
          <TextPref
            label={translator.t('popup_label_ip_version')}
            value={localPrefs.ipVersion ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, ipVersion: v }))}
            dataField="ipVersion"
          />
        </div>
        <div className="flex flex-col gap-3">
          <BoolSelectPref
            label={translator.t('popup_label_internet_status')}
            value={localPrefs.internetEnabled}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, internetEnabled: v }))}
            dataField="internetEnabled"
          />
          <BoolSelectPref
            label={translator.t('popup_label_tr069_status')}
            value={localPrefs.tr069Enabled}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, tr069Enabled: v }))}
            dataField="tr069Enabled"
          />
          <BoolSelectPref
            label={translator.t('settings_pref_band_steering_status')}
            value={localPrefs.bandSteeringEnabled}
            onChange={(v) =>
              setLocalPrefs((p) => ({
                ...p,
                bandSteeringEnabled: v,
              }))
            }
            dataField="bandSteeringEnabled"
          />
          <BoolSelectPref
            label={translator.t('settings_pref_upnp_status')}
            value={localPrefs.upnpEnabled}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, upnpEnabled: v }))}
            dataField="upnpEnabled"
          />
          <BoolSelectPref
            label={translator.t('popup_label_request_pd_status')}
            value={localPrefs.requestPdEnabled}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, requestPdEnabled: v }))}
            dataField="requestPdEnabled"
          />
          <BoolSelectPref
            label={translator.t('popup_label_slaac_status_settings')}
            value={localPrefs.slaacEnabled}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, slaacEnabled: v }))}
            dataField="slaacEnabled"
          />
          <BoolSelectPref
            label={translator.t('popup_label_dhcpv6_status_settings')}
            value={localPrefs.dhcpv6Enabled}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, dhcpv6Enabled: v }))}
            dataField="dhcpv6Enabled"
          />
          <BoolSelectPref
            label={translator.t('popup_label_pd_status_settings')}
            value={localPrefs.pdEnabled}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, pdEnabled: v }))}
            dataField="pdEnabled"
          />
          <BoolSelectPref
            label={translator.t('popup_label_remote_access_ipv4_status')}
            value={localPrefs.remoteAccessIpv4Enabled}
            onChange={(v) =>
              setLocalPrefs((p) => ({
                ...p,
                remoteAccessIpv4Enabled: v,
              }))
            }
            dataField="remoteAccessIpv4Enabled"
          />
          <BoolSelectPref
            label={translator.t('popup_label_remote_access_ipv6_status')}
            value={localPrefs.remoteAccessIpv6Enabled}
            onChange={(v) =>
              setLocalPrefs((p) => ({
                ...p,
                remoteAccessIpv6Enabled: v,
              }))
            }
            dataField="remoteAccessIpv6Enabled"
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
