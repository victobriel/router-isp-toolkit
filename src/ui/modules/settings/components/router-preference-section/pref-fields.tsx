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
import { Badge } from '@/ui/components/ui/badge';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import {
  BOOL_DISABLED_VALUE,
  BOOL_ENABLED_VALUE,
  DISABLED_VALUE,
  WLAN_TRANSMITTING_POWER_OPTIONS,
  WLAN_TRANSMITTING_POWER_VALUE_SET,
} from './constants';

export function asTextFieldValue(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function normalizeToArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim() !== '') return [v];
  return [];
}

/** Returns the canonical string from `acceptableValues` if `raw` matches (case-insensitive trim). */
export function resolveAcceptableValue(
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

export function wlanTransmittingPowerToSelectValue(transmittingPower: string | undefined): string {
  const v = transmittingPower?.trim() ?? '';
  if (v === '' || v === DISABLED_VALUE) return DISABLED_VALUE;
  if (
    WLAN_TRANSMITTING_POWER_VALUE_SET.has(v as (typeof WLAN_TRANSMITTING_POWER_OPTIONS)[number])
  ) {
    return v;
  }
  return WLAN_TRANSMITTING_POWER_OPTIONS[0];
}

export function wlanTransmittingPowerSelectToStored(v: string): string {
  if (v === DISABLED_VALUE) return '';
  return v;
}

export function boolStoredToSelectValue(v: boolean | undefined): string {
  if (v === true) return BOOL_ENABLED_VALUE;
  if (v === false) return BOOL_DISABLED_VALUE;
  return DISABLED_VALUE;
}

export function boolSelectToStoredValue(v: string): boolean | undefined {
  if (v === BOOL_ENABLED_VALUE) return true;
  if (v === BOOL_DISABLED_VALUE) return false;
  return undefined;
}

function boolSelectItems() {
  return [
    { value: BOOL_ENABLED_VALUE, label: translator.t('popup_label_enabled') },
    { value: BOOL_DISABLED_VALUE, label: translator.t('popup_status_disabled') },
  ];
}

export function TextPref({
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

export function SelectPref({
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

export function BoolSelectPref({
  label,
  value,
  onChange,
  dataField,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (next: boolean | undefined) => void;
  dataField: string;
}) {
  return (
    <SelectPref
      label={label}
      value={boolStoredToSelectValue(value)}
      onChange={(v) => onChange(boolSelectToStoredValue(v))}
      dataField={dataField}
      items={boolSelectItems()}
    />
  );
}

export function TagListPref({
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

export type WlanBand = 'wlan24GhzConfig' | 'wlan5GhzConfig';
export type WlanSsidPrefs = 'wlan24GhzSsids' | 'wlan5GhzSsids';
