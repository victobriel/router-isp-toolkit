import { AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/components/ui/accordion';
import { TextPref } from './pref-fields';
import { translator } from '@/infra/i18n/I18nService';
import { Dispatch, SetStateAction } from 'react';
import { RouterPreferencesStore } from '@/application/types';

type Props = {
  localPrefs: RouterPreferencesStore;
  setLocalPrefs: Dispatch<SetStateAction<RouterPreferencesStore>>;
};

export const OpticalSignalAccordionItem = ({ localPrefs, setLocalPrefs }: Props) => {
  return (
    <AccordionItem value="optical_signal" className="border-b-0">
      <AccordionTrigger className="text-sm py-3 hover:no-underline">
        {translator.t('settings_prefs_optical_signal_title')}
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextPref
            label={translator.t('settings_pref_optical_signal')}
            value={localPrefs.opticalSignal ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, opticalSignal: v }))}
            dataField="opticalSignal"
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
