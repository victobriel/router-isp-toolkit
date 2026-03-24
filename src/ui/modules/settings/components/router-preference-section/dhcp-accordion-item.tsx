import type { RouterPreferencesStore } from '@/application/types';
import { translator } from '@/infra/i18n/I18nService';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/components/ui/accordion';
import type { Dispatch, SetStateAction } from 'react';
import { BoolSelectPref, TextPref } from './pref-fields';

type Props = {
  localPrefs: RouterPreferencesStore;
  setLocalPrefs: Dispatch<SetStateAction<RouterPreferencesStore>>;
};

export function DhcpAccordionItem({ localPrefs, setLocalPrefs }: Props) {
  return (
    <AccordionItem value="dhcp" className="border-b-0">
      <AccordionTrigger className="text-sm py-3 hover:no-underline">
        {translator.t('settings_prefs_dhcp_title')}
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BoolSelectPref
            label={translator.t('popup_label_dhcp_status')}
            value={localPrefs.dhcpEnabled}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, dhcpEnabled: v }))}
            dataField="dhcpEnabled"
          />
          <TextPref
            label={translator.t('settings_pref_dhcp_ip_address')}
            value={localPrefs.dhcpIpAddress ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, dhcpIpAddress: v }))}
            dataField="dhcpIpAddress"
          />
          <TextPref
            label={translator.t('settings_pref_dhcp_subnet_mask')}
            value={localPrefs.dhcpSubnetMask ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, dhcpSubnetMask: v }))}
            dataField="dhcpSubnetMask"
          />
          <TextPref
            label={translator.t('settings_pref_dhcp_start_ip')}
            value={localPrefs.dhcpStartIp ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, dhcpStartIp: v }))}
            dataField="dhcpStartIp"
          />
          <TextPref
            label={translator.t('settings_pref_dhcp_end_ip')}
            value={localPrefs.dhcpEndIp ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, dhcpEndIp: v }))}
            dataField="dhcpEndIp"
          />
          <BoolSelectPref
            label={translator.t('popup_label_dhcp_isp_dns_status')}
            value={localPrefs.dhcpIspDnsEnabled}
            onChange={(v) =>
              setLocalPrefs((p) => ({
                ...p,
                dhcpIspDnsEnabled: v,
              }))
            }
            dataField="dhcpIspDnsEnabled"
          />
          <TextPref
            label={translator.t('settings_pref_dhcp_primary_dns')}
            value={localPrefs.dhcpPrimaryDns ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, dhcpPrimaryDns: v }))}
            dataField="dhcpPrimaryDns"
          />
          <TextPref
            label={translator.t('settings_pref_dhcp_secondary_dns')}
            value={localPrefs.dhcpSecondaryDns ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, dhcpSecondaryDns: v }))}
            dataField="dhcpSecondaryDns"
          />
          <TextPref
            label={translator.t('popup_label_dhcp_lease_time_mode')}
            value={localPrefs.dhcpLeaseTimeMode ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, dhcpLeaseTimeMode: v }))}
            dataField="dhcpLeaseTimeMode"
          />
          <TextPref
            label={translator.t('settings_pref_dhcp_lease_time')}
            value={localPrefs.dhcpLeaseTime ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, dhcpLeaseTime: v }))}
            dataField="dhcpLeaseTime"
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
