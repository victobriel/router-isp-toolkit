import { AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/components/ui/accordion';
import { TextPref } from './pref-fields';
import { RouterPreferencesStore } from '@/application/types';
import { Dispatch, SetStateAction } from 'react';
import { translator } from '@/infra/i18n/I18nService';

type Props = {
  localPrefs: RouterPreferencesStore;
  setLocalPrefs: Dispatch<SetStateAction<RouterPreferencesStore>>;
};

export const CredentialsAccordionItem = ({ localPrefs, setLocalPrefs }: Props) => {
  return (
    <AccordionItem value="credentials" className="border-b-0">
      <AccordionTrigger className="text-sm py-3 hover:no-underline">
        {translator.t('settings_prefs_credentials_title')}
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextPref
            label={translator.t('settings_pref_router_password')}
            value={localPrefs.routerAdminPassword ?? ''}
            onChange={(v) => setLocalPrefs((p) => ({ ...p, routerAdminPassword: v }))}
            dataField="routerAdminPassword"
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
