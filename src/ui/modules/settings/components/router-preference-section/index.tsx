import type { ModelBookmarks, RouterPreferencesStore } from '@/application/types';
import { translator } from '@/infra/i18n/I18nService';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/ui/components/ui/accordion';
import { Badge } from '@/ui/components/ui/badge';
import { Plus, Save, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const UNSELECTED_MODEL_VALUE = '_unselected';
const DISABLED_VALUE = '_disabled';

/** Common 20 MHz center channels for 5 GHz (UNII / DFS / extended). */
const WLAN5_80MHZ_CHANNELS: string[] = [
  'Auto',
  '36',
  '40',
  '44',
  '48',
  '52',
  '56',
  '60',
  '64',
  '100',
  '104',
  '108',
  '112',
  '116',
  '120',
  '124',
  '128',
  '149',
  '153',
  '157',
  '161',
] as const;

const WLAN_TRANSMITTING_POWER_OPTIONS = ['100%', '80%', '60%', '40%', '20%'] as const;
const WLAN_TRANSMITTING_POWER_VALUE_SET = new Set(WLAN_TRANSMITTING_POWER_OPTIONS);

function wlanTransmittingPowerToSelectValue(transmittingPower: string | undefined): string {
  const v = transmittingPower?.trim() ?? '';
  if (v === '' || v === DISABLED_VALUE) return DISABLED_VALUE;
  if (
    WLAN_TRANSMITTING_POWER_VALUE_SET.has(v as (typeof WLAN_TRANSMITTING_POWER_OPTIONS)[number])
  ) {
    return v;
  }
  return WLAN_TRANSMITTING_POWER_OPTIONS[0];
}

function wlanTransmittingPowerSelectToStored(v: string): string {
  if (v === DISABLED_VALUE) return '';
  return v;
}

const DHCP_LEASE_TIME_MODE_CUSTOM_VALUE = 'Custom';
const DHCP_LEASE_TIME_MODE_INFINITY_VALUE = 'Infinity';

function dhcpLeaseTimeModeStoredToSelectValue(mode: string | undefined): string {
  const v = mode?.trim() ?? '';
  if (v === '' || v === DISABLED_VALUE) return DISABLED_VALUE;
  return v.toLowerCase() === DHCP_LEASE_TIME_MODE_INFINITY_VALUE.toLowerCase()
    ? DHCP_LEASE_TIME_MODE_INFINITY_VALUE
    : DHCP_LEASE_TIME_MODE_CUSTOM_VALUE;
}

interface RouterPreferenceSectionProps {
  bookmarkEntries: Array<[string, ModelBookmarks]>;
  /** Model keys that already have a saved preference object. */
  existingPreferenceModelKeys: string[];
  selectedModelKey: string;
  onSelectedModelKeyChange: (modelKey: string) => void;
  prefs: RouterPreferencesStore;
  onSavePrefs: (prefs: RouterPreferencesStore) => void;
}

type WlanBand = 'wlan24GhzConfig' | 'wlan5GhzConfig';
type WlanSsidPrefs = 'wlan24GhzSsids' | 'wlan5GhzSsids';

function asTextFieldValue(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function TextPref({
  label,
  value,
  onChange,
  dataField,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dataField: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-pref-field={dataField}
        className="text-xs"
      />
    </div>
  );
}

function SelectPref({
  label,
  value,
  onChange,
  dataField,
  items,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dataField: string;
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className="h-8! w-full text-xs shadow-sm py-1!"
          size="sm"
          data-pref-field={dataField}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DISABLED_VALUE} className="text-xs">
            —
          </SelectItem>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} className="text-xs">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function normalizeToArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim() !== '') return [v];
  return [];
}

/** Returns the canonical string from `acceptableValues` if `raw` matches (case-insensitive trim). */
function resolveAcceptableValue(
  raw: string,
  acceptableValues: readonly string[],
): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const lower = t.toLowerCase();
  for (const a of acceptableValues) {
    if (a.toLowerCase() === lower) return a;
  }
  return undefined;
}

function TagListPref({
  label,
  value: rawValue,
  onChange,
  dataField,
  acceptableValues,
  placeholder,
}: {
  label: string;
  value: string | string[];
  onChange: (v: string[]) => void;
  dataField: string;
  acceptableValues: readonly string[];
  placeholder?: string;
}) {
  const value = normalizeToArray(rawValue);
  const [draft, setDraft] = useState('');

  const pendingCanonical = resolveAcceptableValue(draft, acceptableValues);
  const canAdd = Boolean(pendingCanonical && !value.includes(pendingCanonical));

  const addChannel = () => {
    const canonical = resolveAcceptableValue(draft, acceptableValues);
    if (!canonical || value.includes(canonical)) return;
    onChange([...value, canonical]);
    setDraft('');
  };

  const removeChannel = (ch: string) => {
    onChange(value.filter((v) => v !== ch));
  };

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-1.5" data-pref-field={dataField}>
        <Input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addChannel();
            }
          }}
          placeholder={placeholder}
          className="text-xs flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0 h-8! px-2"
          onClick={addChannel}
          disabled={!canAdd}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {value.map((ch) => (
            <Badge key={ch} variant="secondary" className="gap-0.5 pr-1 text-[0.65rem]">
              {ch}
              <button
                type="button"
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                onClick={() => removeChannel(ch)}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

const BOOL_ENABLED_VALUE = 'enabled';
const BOOL_DISABLED_VALUE = 'disabled';

function boolStoredToSelectValue(v: boolean | undefined): string {
  if (v === true) return BOOL_ENABLED_VALUE;
  if (v === false) return BOOL_DISABLED_VALUE;
  return DISABLED_VALUE;
}

function boolSelectToStoredValue(v: string): boolean | undefined {
  if (v === BOOL_ENABLED_VALUE) return true;
  if (v === BOOL_DISABLED_VALUE) return false;
  return undefined;
}

export const RouterPreferenceSection = ({
  bookmarkEntries,
  existingPreferenceModelKeys,
  selectedModelKey,
  onSelectedModelKeyChange,
  prefs,
  onSavePrefs,
}: RouterPreferenceSectionProps) => {
  const [localPrefs, setLocalPrefs] = useState<RouterPreferencesStore>(prefs);
  const [customModelKeyDraft, setCustomModelKeyDraft] = useState('');

  const bookmarkKeySet = useMemo(() => new Set(bookmarkEntries.map(([k]) => k)), [bookmarkEntries]);

  const modelKeyOptions = useMemo(() => {
    const s = new Set<string>(bookmarkKeySet);
    for (const k of existingPreferenceModelKeys) s.add(k);
    if (selectedModelKey) s.add(selectedModelKey);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [bookmarkKeySet, existingPreferenceModelKeys, selectedModelKey]);

  const labelForModelKey = (key: string) => {
    const hit = bookmarkEntries.find(([k]) => k === key);
    if (hit?.[1].model) return hit[1].model;
    return key;
  };

  useEffect(() => {
    setLocalPrefs(prefs);
  }, [prefs]);

  const modelSelected = selectedModelKey.trim().length > 0;

  const applyCustomModelKey = () => {
    const next = customModelKeyDraft.trim();
    if (!next) return;
    onSelectedModelKeyChange(next);
    setCustomModelKeyDraft('');
  };

  const patchWlan = (band: WlanBand, patch: NonNullable<RouterPreferencesStore[typeof band]>) => {
    setLocalPrefs((prev) => ({
      ...prev,
      [band]: { ...prev[band], ...patch },
    }));
  };

  const patchSsid = (
    key: WlanSsidPrefs,
    patch: NonNullable<RouterPreferencesStore[typeof key]>,
  ) => {
    setLocalPrefs((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">
          {translator.t('settings_section_router_preferences')}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {translator.t('settings_router_preferences_desc')}
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
        <label className="text-xs font-medium text-foreground">
          {translator.t('settings_prefs_model_label')}
        </label>
        <Select
          value={selectedModelKey.trim() ? selectedModelKey : UNSELECTED_MODEL_VALUE}
          onValueChange={(v) => onSelectedModelKeyChange(v === UNSELECTED_MODEL_VALUE ? '' : v)}
        >
          <SelectTrigger className="w-full h-8! text-xs" size="sm">
            <SelectValue placeholder={translator.t('settings_prefs_model_placeholder_select')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSELECTED_MODEL_VALUE} className="text-xs">
              {translator.t('settings_prefs_model_placeholder_select')}
            </SelectItem>
            {modelKeyOptions.map((key) => (
              <SelectItem key={key} value={key} className="text-xs">
                {labelForModelKey(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-[0.65rem] text-muted-foreground">
              {translator.t('settings_prefs_model_custom_hint')}
            </label>
            <Input
              className="h-8! text-xs font-mono"
              value={customModelKeyDraft}
              onChange={(e) => setCustomModelKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyCustomModelKey();
                }
              }}
              placeholder="ZXHN H199"
              data-pref-model-custom
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={applyCustomModelKey}
            disabled={!customModelKeyDraft.trim()}
          >
            {translator.t('settings_prefs_model_apply')}
          </Button>
        </div>
        {!modelSelected ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {translator.t('settings_prefs_model_pick_first')}
          </p>
        ) : null}
      </div>

      <div
        className={!modelSelected ? 'pointer-events-none opacity-40' : undefined}
        aria-hidden={!modelSelected}
      >
        <Accordion
          type="multiple"
          className="w-full border border-border rounded-lg px-3 space-y-3"
        >
          <AccordionItem value="wlan24" className="border-b-0">
            <AccordionTrigger className="text-sm py-3 hover:no-underline">
              {translator.t('settings_prefs_wlan24_title')}
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectPref
                  label={translator.t('settings_pref_wlan_24_status')}
                  value={
                    localPrefs.wlan24GhzConfig?.enabled === true
                      ? 'enabled'
                      : localPrefs.wlan24GhzConfig?.enabled === false
                        ? 'disabled'
                        : DISABLED_VALUE
                  }
                  onChange={(v) =>
                    patchWlan('wlan24GhzConfig', {
                      enabled: v === 'enabled' ? true : v === 'disabled' ? false : undefined,
                    })
                  }
                  dataField="wlan24GhzConfig.enabled"
                  items={[
                    { value: 'enabled', label: translator.t('popup_label_enabled') },
                    { value: 'disabled', label: translator.t('popup_status_disabled') },
                  ]}
                />
                <TagListPref
                  label={translator.t('settings_pref_wlan_24_channel')}
                  value={localPrefs.wlan24GhzConfig?.channel ?? []}
                  onChange={(v) => patchWlan('wlan24GhzConfig', { channel: v })}
                  dataField="wlan24GhzConfig.channel"
                  acceptableValues={Array.from({ length: 13 }, (_, i) => String(i + 1)).concat([
                    'Auto',
                  ])}
                  placeholder="Auto, 1-13"
                />
                <TextPref
                  label={translator.t('settings_pref_wlan_24_mode')}
                  value={localPrefs.wlan24GhzConfig?.mode ?? ''}
                  onChange={(v) => patchWlan('wlan24GhzConfig', { mode: v })}
                  dataField="wlan24GhzConfig.mode"
                />
                <TagListPref
                  label={translator.t('settings_pref_wlan_24_band_width')}
                  value={localPrefs.wlan24GhzConfig?.bandWidth ?? []}
                  onChange={(v) => patchWlan('wlan24GhzConfig', { bandWidth: v })}
                  dataField="wlan24GhzConfig.bandWidth"
                  acceptableValues={['Auto', '20MHz', '40MHz']}
                  placeholder="Auto, 20MHz, 40MHz"
                />
                <SelectPref
                  label={translator.t('settings_pref_wlan_24_transmitting_power')}
                  value={wlanTransmittingPowerToSelectValue(
                    localPrefs.wlan24GhzConfig?.transmittingPower,
                  )}
                  onChange={(v) =>
                    patchWlan('wlan24GhzConfig', {
                      transmittingPower: wlanTransmittingPowerSelectToStored(v),
                    })
                  }
                  dataField="wlan24GhzConfig.transmittingPower"
                  items={WLAN_TRANSMITTING_POWER_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextPref
                  label={translator.t('popup_label_ssid_name')}
                  value={asTextFieldValue(localPrefs.wlan24GhzSsids?.ssidName)}
                  onChange={(v) => patchSsid('wlan24GhzSsids', { ssidName: v })}
                  dataField="wlan24GhzSsids.ssidName"
                />
                <SelectPref
                  label={translator.t('popup_label_ssid_hide_mode')}
                  value={boolStoredToSelectValue(localPrefs.wlan24GhzSsids?.ssidHideMode)}
                  onChange={(v) =>
                    patchSsid('wlan24GhzSsids', { ssidHideMode: boolSelectToStoredValue(v) })
                  }
                  dataField="wlan24GhzSsids.ssidHideMode"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <TextPref
                  label={translator.t('popup_label_wpa2_security')}
                  value={localPrefs.wlan24GhzSsids?.wpa2SecurityType ?? ''}
                  onChange={(v) => patchSsid('wlan24GhzSsids', { wpa2SecurityType: v })}
                  dataField="wlan24GhzSsids.wpa2SecurityType"
                />
                <TextPref
                  label={translator.t('popup_label_max_clients')}
                  value={asTextFieldValue(localPrefs.wlan24GhzSsids?.maxClients)}
                  onChange={(v) => patchSsid('wlan24GhzSsids', { maxClients: v })}
                  dataField="wlan24GhzSsids.maxClients"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="wlan5" className="border-b-0">
            <AccordionTrigger className="text-sm py-3 hover:no-underline">
              {translator.t('settings_prefs_wlan5_title')}
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectPref
                  label={translator.t('settings_pref_wlan_5_status')}
                  value={boolStoredToSelectValue(localPrefs.wlan5GhzConfig?.enabled)}
                  onChange={(v) =>
                    patchWlan('wlan5GhzConfig', { enabled: boolSelectToStoredValue(v) })
                  }
                  dataField="wlan5GhzConfig.enabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <TagListPref
                  label={translator.t('settings_pref_wlan_5_channel')}
                  value={localPrefs.wlan5GhzConfig?.channel ?? []}
                  onChange={(v) => patchWlan('wlan5GhzConfig', { channel: v })}
                  dataField="wlan5GhzConfig.channel"
                  acceptableValues={WLAN5_80MHZ_CHANNELS}
                  placeholder="Auto, 36, 40, 44, 48, 149..."
                />
                <TextPref
                  label={translator.t('settings_pref_wlan_5_mode')}
                  value={localPrefs.wlan5GhzConfig?.mode ?? ''}
                  onChange={(v) => patchWlan('wlan5GhzConfig', { mode: v })}
                  dataField="wlan5GhzConfig.mode"
                />
                <TagListPref
                  label={translator.t('settings_pref_wlan_5_band_width')}
                  value={localPrefs.wlan5GhzConfig?.bandWidth ?? []}
                  onChange={(v) => patchWlan('wlan5GhzConfig', { bandWidth: v })}
                  dataField="wlan5GhzConfig.bandWidth"
                  acceptableValues={['Auto', '20MHz', '40MHz', '80MHz', '160MHz']}
                  placeholder="Auto, 20MHz, 40MHz, 80MHz, 160MHz"
                />
                <SelectPref
                  label={translator.t('settings_pref_wlan_5_transmitting_power')}
                  value={wlanTransmittingPowerToSelectValue(
                    localPrefs.wlan5GhzConfig?.transmittingPower,
                  )}
                  onChange={(v) =>
                    patchWlan('wlan5GhzConfig', {
                      transmittingPower: wlanTransmittingPowerSelectToStored(v),
                    })
                  }
                  dataField="wlan5GhzConfig.transmittingPower"
                  items={WLAN_TRANSMITTING_POWER_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextPref
                  label={translator.t('popup_label_ssid_name')}
                  value={asTextFieldValue(localPrefs.wlan5GhzSsids?.ssidName)}
                  onChange={(v) => patchSsid('wlan5GhzSsids', { ssidName: v })}
                  dataField="wlan5GhzSsids.ssidName"
                />
                <SelectPref
                  label={translator.t('popup_label_ssid_hide_mode')}
                  value={boolStoredToSelectValue(localPrefs.wlan5GhzSsids?.ssidHideMode)}
                  onChange={(v) =>
                    patchSsid('wlan5GhzSsids', { ssidHideMode: boolSelectToStoredValue(v) })
                  }
                  dataField="wlan5GhzSsids.ssidHideMode"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <TextPref
                  label={translator.t('popup_label_wpa2_security')}
                  value={localPrefs.wlan5GhzSsids?.wpa2SecurityType ?? ''}
                  onChange={(v) => patchSsid('wlan5GhzSsids', { wpa2SecurityType: v })}
                  dataField="wlan5GhzSsids.wpa2SecurityType"
                />
                <TextPref
                  label={translator.t('popup_label_max_clients')}
                  value={asTextFieldValue(localPrefs.wlan5GhzSsids?.maxClients)}
                  onChange={(v) => patchSsid('wlan5GhzSsids', { maxClients: v })}
                  dataField="wlan5GhzSsids.maxClients"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="dhcp" className="border-b-0">
            <AccordionTrigger className="text-sm py-3 hover:no-underline">
              {translator.t('settings_prefs_dhcp_title')}
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectPref
                  label={translator.t('popup_label_dhcp_status')}
                  value={boolStoredToSelectValue(localPrefs.dhcpEnabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({ ...p, dhcpEnabled: boolSelectToStoredValue(v) }))
                  }
                  dataField="dhcpEnabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
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
                <SelectPref
                  label={translator.t('popup_label_dhcp_isp_dns_status')}
                  value={boolStoredToSelectValue(localPrefs.dhcpIspDnsEnabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({
                      ...p,
                      dhcpIspDnsEnabled: boolSelectToStoredValue(v),
                    }))
                  }
                  dataField="dhcpIspDnsEnabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
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
                <SelectPref
                  label={translator.t('popup_label_dhcp_lease_time_mode')}
                  value={dhcpLeaseTimeModeStoredToSelectValue(localPrefs.dhcpLeaseTimeMode)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({
                      ...p,
                      dhcpLeaseTimeMode:
                        v === '' || v === DISABLED_VALUE
                          ? DISABLED_VALUE
                          : v === DHCP_LEASE_TIME_MODE_INFINITY_VALUE
                            ? DHCP_LEASE_TIME_MODE_INFINITY_VALUE
                            : DHCP_LEASE_TIME_MODE_CUSTOM_VALUE,
                    }))
                  }
                  dataField="dhcpLeaseTimeMode"
                  items={[
                    { value: DHCP_LEASE_TIME_MODE_CUSTOM_VALUE, label: 'Custom' },
                    { value: DHCP_LEASE_TIME_MODE_INFINITY_VALUE, label: 'Infinity' },
                  ]}
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
                <SelectPref
                  label={translator.t('popup_label_internet_status')}
                  value={boolStoredToSelectValue(localPrefs.internetEnabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({ ...p, internetEnabled: boolSelectToStoredValue(v) }))
                  }
                  dataField="internetEnabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <SelectPref
                  label={translator.t('popup_label_tr069_status')}
                  value={boolStoredToSelectValue(localPrefs.tr069Enabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({ ...p, tr069Enabled: boolSelectToStoredValue(v) }))
                  }
                  dataField="tr069Enabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <SelectPref
                  label={translator.t('settings_pref_band_steering_status')}
                  value={boolStoredToSelectValue(localPrefs.bandSteeringEnabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({
                      ...p,
                      bandSteeringEnabled: boolSelectToStoredValue(v),
                    }))
                  }
                  dataField="bandSteeringEnabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <SelectPref
                  label={translator.t('settings_pref_upnp_status')}
                  value={boolStoredToSelectValue(localPrefs.upnpEnabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({ ...p, upnpEnabled: boolSelectToStoredValue(v) }))
                  }
                  dataField="upnpEnabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <SelectPref
                  label={translator.t('popup_label_request_pd_status')}
                  value={boolStoredToSelectValue(localPrefs.requestPdEnabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({ ...p, requestPdEnabled: boolSelectToStoredValue(v) }))
                  }
                  dataField="requestPdEnabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <SelectPref
                  label={translator.t('popup_label_slaac_status_settings')}
                  value={boolStoredToSelectValue(localPrefs.slaacEnabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({ ...p, slaacEnabled: boolSelectToStoredValue(v) }))
                  }
                  dataField="slaacEnabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <SelectPref
                  label={translator.t('popup_label_dhcpv6_status_settings')}
                  value={boolStoredToSelectValue(localPrefs.dhcpv6Enabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({ ...p, dhcpv6Enabled: boolSelectToStoredValue(v) }))
                  }
                  dataField="dhcpv6Enabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <SelectPref
                  label={translator.t('popup_label_pd_status_settings')}
                  value={boolStoredToSelectValue(localPrefs.pdEnabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({ ...p, pdEnabled: boolSelectToStoredValue(v) }))
                  }
                  dataField="pdEnabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <SelectPref
                  label={translator.t('popup_label_remote_access_ipv4_status')}
                  value={boolStoredToSelectValue(localPrefs.remoteAccessIpv4Enabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({
                      ...p,
                      remoteAccessIpv4Enabled: boolSelectToStoredValue(v),
                    }))
                  }
                  dataField="remoteAccessIpv4Enabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
                <SelectPref
                  label={translator.t('popup_label_remote_access_ipv6_status')}
                  value={boolStoredToSelectValue(localPrefs.remoteAccessIpv6Enabled)}
                  onChange={(v) =>
                    setLocalPrefs((p) => ({
                      ...p,
                      remoteAccessIpv6Enabled: boolSelectToStoredValue(v),
                    }))
                  }
                  dataField="remoteAccessIpv6Enabled"
                  items={[
                    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
                    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
                  ]}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <Button
        size="sm"
        onClick={() => onSavePrefs(localPrefs)}
        className="gap-1.5"
        type="button"
        disabled={!modelSelected}
      >
        <Save className="h-3.5 w-3.5" />
        {translator.t('settings_router_preferences_save')}
      </Button>
    </section>
  );
};
