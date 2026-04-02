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
import { Accordion } from '@/ui/components/ui/accordion';
import { Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { UNSELECTED_MODEL_VALUE } from './constants';
import { DhcpAccordionItem } from './dhcp-accordion-item';
import { OtherAccordionItem } from './other-accordion-item';
import { WlanBandAccordionItem } from './wlan-band-accordion-item';
import { Band } from '@/ui/types';
import { CredentialsAccordionItem } from './credentials-accordion-item';

export interface RouterPreferenceSectionProps {
  bookmarkEntries: Array<[string, ModelBookmarks]>;
  /** Model keys that already have a saved preference object. */
  existingPreferenceModelKeys: string[];
  selectedModelKey: string;
  onSelectedModelKeyChange: (modelKey: string) => void;
  prefs: RouterPreferencesStore;
  onSavePrefs: (prefs: RouterPreferencesStore) => void;
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
              placeholder="e.g. ZTE ZXHN H199"
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
          <CredentialsAccordionItem localPrefs={localPrefs} setLocalPrefs={setLocalPrefs} />
          <WlanBandAccordionItem
            accordionValue={Band.GHz24}
            title={translator.t('settings_prefs_wlan24_title')}
            localPrefs={localPrefs}
            setLocalPrefs={setLocalPrefs}
          />
          <WlanBandAccordionItem
            accordionValue={Band.GHz5}
            title={translator.t('settings_prefs_wlan5_title')}
            localPrefs={localPrefs}
            setLocalPrefs={setLocalPrefs}
          />
          <DhcpAccordionItem localPrefs={localPrefs} setLocalPrefs={setLocalPrefs} />
          <OtherAccordionItem localPrefs={localPrefs} setLocalPrefs={setLocalPrefs} />
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
