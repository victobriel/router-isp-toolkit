import { GoToPageOptions, RouterPage, RouterPageKey } from '@/application/types';
import { ExtractionResult } from '@/domain/schemas/validation';
import { translator } from '@/infra/i18n/I18nService';
import { Collapsible } from '@/ui/components/ui/collapsible';
import {
  PopupDataRow,
  PopupDataRowProps,
} from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/types/router-data.types';
import { Server } from 'lucide-react';

interface RemoteAccessSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
  supportsGoToPage: boolean;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
}

export const RemoteAccessSection = ({
  data,
  routerPreferencesComparison,
  supportsGoToPage,
  goToPage,
}: RemoteAccessSectionProps) => {
  const handleGoToPage = (page: RouterPage, key: RouterPageKey) => {
    void goToPage(page, key);
  };

  const rowGo = (fn: () => void): (() => void) | undefined => (supportsGoToPage ? fn : undefined);

  const remoteAccessData = {
    ipv4Enabled: data.remoteAccessIpv4Enabled,
    ipv6Enabled: data.remoteAccessIpv6Enabled,
  };

  const dataIsEmpty = Object.values(remoteAccessData).every(
    (value) => value === undefined || value === null,
  );

  if (dataIsEmpty) return null;

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_remote_access_ipv4'),
      compareMatch: routerPreferencesComparison?.remoteAccessIpv4Enabled,
      value: remoteAccessData.ipv4Enabled,
      handleGoToPage: rowGo(() =>
        handleGoToPage(RouterPage.REMOTE_ACCESS, RouterPageKey.REMOTE_ACCESS_IPV4_STATUS),
      ),
    },
    {
      label: translator.t('popup_label_remote_access_ipv6'),
      compareMatch: routerPreferencesComparison?.remoteAccessIpv6Enabled,
      value: remoteAccessData.ipv6Enabled,
      handleGoToPage: rowGo(() =>
        handleGoToPage(RouterPage.REMOTE_ACCESS, RouterPageKey.REMOTE_ACCESS_IPV6_STATUS),
      ),
    },
  ];

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Server className="size-3.5" />
          {translator.t('popup_section_remote_access')}
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
