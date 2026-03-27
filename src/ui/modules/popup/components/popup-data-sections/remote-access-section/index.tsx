import { Collapsible } from '@/ui/components/ui/collapsible';
import { Server } from 'lucide-react';
import {
  PopupDataRow,
  PopupDataRowProps,
} from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { ExtractionResult } from '@/domain/schemas/validation';
import { translator } from '@/infra/i18n/I18nService';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/types/router-data.types';
import { GoToPageOptions, RouterPage, RouterPageKey } from '@/application/types';

interface RemoteAccessSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
}

export const RemoteAccessSection = ({
  data,
  routerPreferencesComparison,
  goToPage,
}: RemoteAccessSectionProps) => {
  const handleGoToPage = (page: RouterPage, key: RouterPageKey) => {
    void goToPage(page, key);
  };

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_remote_access_ipv4'),
      compareMatch: routerPreferencesComparison?.remoteAccessIpv4Enabled,
      value: data.remoteAccessIpv4Enabled,
      handleGoToPage: () =>
        handleGoToPage(RouterPage.REMOTE_ACCESS, RouterPageKey.REMOTE_ACCESS_IPV4_STATUS),
    },
    {
      label: translator.t('popup_label_remote_access_ipv6'),
      compareMatch: routerPreferencesComparison?.remoteAccessIpv6Enabled,
      value: data.remoteAccessIpv6Enabled,
      handleGoToPage: () =>
        handleGoToPage(RouterPage.REMOTE_ACCESS, RouterPageKey.REMOTE_ACCESS_IPV6_STATUS),
    },
  ];

  const hasData = rows.some(
    (row) => row.value !== undefined && row.value !== null && row.value !== '-',
  );

  return (
    <Collapsible
      defaultOpen={hasData}
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
