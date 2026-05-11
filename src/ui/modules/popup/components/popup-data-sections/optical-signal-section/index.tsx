import { GoToPageOptions, RouterPage, RouterPageKey } from '@/application/types';
import { ExtractionResult } from '@/domain/schemas/validation';
import { translator } from '@/infra/i18n/I18nService';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { val } from '@/ui/lib/utils';
import {
  PopupDataRow,
  PopupDataRowProps,
} from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/types/router-data.types';
import { Signal } from 'lucide-react';

interface OpticalSignalSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
  supportsGoToPage: boolean;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
}

export const OpticalSignalSection = ({
  data,
  routerPreferencesComparison,
  supportsGoToPage,
  goToPage,
}: OpticalSignalSectionProps) => {
  const handleGoToPage = (page: RouterPage, key: RouterPageKey) => {
    void goToPage(page, key);
  };

  const rowGo = (fn: () => void): (() => void) | undefined => (supportsGoToPage ? fn : undefined);

  const opticalSignalData = {
    opticalSignal: data.opticalSignal,
  };

  const dataIsEmpty = Object.values(opticalSignalData).every(
    (value) => value === undefined || value === null,
  );

  if (dataIsEmpty) return null;

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_optical_signal'),
      compareMatch: routerPreferencesComparison?.opticalSignal,
      value: `${val(opticalSignalData.opticalSignal)} dBm`,
      handleGoToPage: rowGo(() =>
        handleGoToPage(RouterPage.OPTICAL_SIGNAL, RouterPageKey.OPTICAL_SIGNAL_STATUS),
      ),
    },
  ];

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Signal className="size-3.5" />
          {translator.t('popup_section_optical_signal')}
        </span>
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
      </div>
    </Collapsible>
  );
};
