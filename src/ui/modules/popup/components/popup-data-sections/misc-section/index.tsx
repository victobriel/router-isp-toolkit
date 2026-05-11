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
import { Router } from 'lucide-react';

interface MiscSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
  supportsGoToPage: boolean;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
  lastAuthAdminCredentials: { username: string; password: string } | null;
}

export const MiscSection = ({
  data,
  routerPreferencesComparison,
  supportsGoToPage,
  goToPage,
  lastAuthAdminCredentials,
}: MiscSectionProps) => {
  const handleGoToPage = (page: RouterPage, key: RouterPageKey) => {
    void goToPage(page, key);
  };

  const rowGo = (fn: () => void): (() => void) | undefined => (supportsGoToPage ? fn : undefined);

  const miscData = {
    routerAdminPassword: lastAuthAdminCredentials?.password,
    routerModel: data.routerModel,
    routerVersion: data.routerVersion,
    tr069Url: data.tr069Url,
    upnpEnabled: data.upnpEnabled,
    bandSteeringEnabled: data.bandSteeringEnabled,
  };

  const dataIsEmpty = Object.values(miscData).every(
    (value) => value === undefined || value === null,
  );

  if (dataIsEmpty) return null;

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_router_password'),
      compareMatch: routerPreferencesComparison?.routerAdminPassword,
      value: val(miscData.routerAdminPassword),
      ableToCopy: true,
      handleGoToPage: rowGo(() =>
        handleGoToPage(RouterPage.MANAGEMENT, RouterPageKey.CHANGE_CREDENTIALS),
      ),
    },
    {
      label: translator.t('popup_label_model'),
      value: val(miscData.routerModel),
      ableToCopy: true,
    },
    {
      label: translator.t('popup_label_version'),
      compareMatch: routerPreferencesComparison?.routerVersion,
      value: val(miscData.routerVersion),
      ableToCopy: true,
      handleGoToPage: rowGo(() => handleGoToPage(RouterPage.MANAGEMENT, RouterPageKey.UPDATE)),
    },
    {
      label: `${translator.t('popup_label_tr069')} ${translator.t('popup_label_url')}`,
      compareMatch: routerPreferencesComparison?.tr069Url,
      value: val(miscData.tr069Url),
      ableToCopy: true,
      handleGoToPage: rowGo(() => handleGoToPage(RouterPage.TR_069, RouterPageKey.TR_069_URL)),
    },
    {
      label: translator.t('popup_section_upnp'),
      compareMatch: routerPreferencesComparison?.upnpEnabled,
      value: miscData.upnpEnabled,
      handleGoToPage: rowGo(() => handleGoToPage(RouterPage.UPnP, RouterPageKey.UPNP_STATUS)),
    },
    {
      label: translator.t('popup_section_band_steering'),
      compareMatch: routerPreferencesComparison?.bandSteeringEnabled,
      value: miscData.bandSteeringEnabled,
      handleGoToPage: rowGo(() =>
        handleGoToPage(RouterPage.BAND_STEERING, RouterPageKey.BAND_STEERING_STATUS),
      ),
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
