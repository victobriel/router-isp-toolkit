import { ExtractionResult } from '@/domain/schemas/validation';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { val } from '@/ui/lib/utils';
import { Router } from 'lucide-react';
import {
  PopupDataRow,
  PopupDataRowProps,
} from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { translator } from '@/infra/i18n/I18nService';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/components/popup-data-provider';
import { GoToPageOptions, RouterPage, RouterPageKey } from '@/application/types';

interface MiscSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
}

export const MiscSection = ({ data, routerPreferencesComparison, goToPage }: MiscSectionProps) => {
  const handleGoToPage = (page: RouterPage, key: RouterPageKey) => {
    void goToPage(page, key);
  };

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_model'),
      value: val(data.routerModel),
      ableToCopy: true,
    },
    {
      label: translator.t('popup_label_version'),
      compareMatch: routerPreferencesComparison?.routerVersion,
      value: val(data.routerVersion),
      ableToCopy: true,
      handleGoToPage: () => handleGoToPage(RouterPage.MANAGEMENT, RouterPageKey.UPDATE),
    },
    {
      label: `${translator.t('popup_label_tr069')} ${translator.t('popup_label_url')}`,
      compareMatch: routerPreferencesComparison?.tr069Url,
      value: val(data.tr069Url),
      ableToCopy: true,
      handleGoToPage: () => handleGoToPage(RouterPage.TR_069, RouterPageKey.TR_069_URL),
    },
    {
      label: translator.t('popup_section_upnp'),
      compareMatch: routerPreferencesComparison?.upnpEnabled,
      value: data.upnpEnabled,
      handleGoToPage: () => handleGoToPage(RouterPage.UPnP, RouterPageKey.UPNP_STATUS),
    },
    {
      label: translator.t('popup_section_band_steering'),
      compareMatch: routerPreferencesComparison?.bandSteeringEnabled,
      value: data.bandSteeringEnabled,
      handleGoToPage: () =>
        handleGoToPage(RouterPage.BAND_STEERING, RouterPageKey.BAND_STEERING_STATUS),
    },
  ];

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Router className="size-3.5" />
          {translator.t('popup_section_misc_router_info')}
        </span>
      }
    >
      <div className="space-y-0.5">
        {rows.map((row) => (
          <PopupDataRow
            key={row.label}
            label={row.label}
            value={row.value}
            compareMatch={row.compareMatch}
            ableToCopy={row.ableToCopy}
            handleGoToPage={row.handleGoToPage}
          />
        ))}
      </div>
    </Collapsible>
  );
};
