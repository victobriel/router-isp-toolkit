import { ExtractionResult } from '@/domain/schemas/validation';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { Network } from 'lucide-react';
import {
  PopupDataRow,
  PopupDataRowProps,
} from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { val } from '@/ui/lib/utils';
import { Separator } from '@/ui/components/ui/separator';
import { translator } from '@/infra/i18n/I18nService';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/types/router-data.types';
import { GoToPageOptions, RouterPage, RouterPageKey } from '@/application/types';

interface WanSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
}

export const WanSection = ({ data, routerPreferencesComparison, goToPage }: WanSectionProps) => {
  const handleGoToPage = (page: RouterPage, key: RouterPageKey) => {
    void goToPage(page, key);
  };

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_pppoe'),
      compareMatch: routerPreferencesComparison?.pppoeUsername,
      value: val(data.pppoeUsername),
      ableToCopy: true,
      handleGoToPage: () => handleGoToPage(RouterPage.WAN, RouterPageKey.PPPOE_USERNAME),
    },
    {
      label: translator.t('popup_label_internet'),
      compareMatch: routerPreferencesComparison?.internetEnabled,
      value: data.internetEnabled,
      handleGoToPage: () => handleGoToPage(RouterPage.WAN, RouterPageKey.INTERNET_STATUS),
    },
    {
      label: translator.t('popup_label_tr069'),
      compareMatch: routerPreferencesComparison?.tr069Enabled,
      value: data.tr069Enabled,
      handleGoToPage: () => handleGoToPage(RouterPage.WAN, RouterPageKey.TR_069_STATUS),
    },
    {
      label: translator.t('popup_label_link_speed'),
      compareMatch: routerPreferencesComparison?.linkSpeed,
      value: val(data.linkSpeed),
      handleGoToPage: () => handleGoToPage(RouterPage.WAN, RouterPageKey.LINK_SPEED),
    },
    {
      label: translator.t('popup_label_ip_version'),
      compareMatch: routerPreferencesComparison?.ipVersion,
      value: val(data.ipVersion ?? undefined),
      handleGoToPage: () => handleGoToPage(RouterPage.WAN, RouterPageKey.IP_VERSION),
    },
  ];
  if (data.ipVersion?.includes('6')) {
    rows.push(
      {
        label: translator.t('popup_label_request_pd'),
        compareMatch: routerPreferencesComparison?.requestPdEnabled,
        value: data.requestPdEnabled,
        handleGoToPage: () => handleGoToPage(RouterPage.WAN, RouterPageKey.REQUEST_PD_STATUS),
      },
      {
        label: translator.t('popup_label_slaac_status'),
        compareMatch: routerPreferencesComparison?.slaacEnabled,
        value: data.slaacEnabled,
        handleGoToPage: () => handleGoToPage(RouterPage.WAN, RouterPageKey.SLAAC_STATUS),
      },
      {
        label: translator.t('popup_label_dhcpv6_status'),
        compareMatch: routerPreferencesComparison?.dhcpv6Enabled,
        value: data.dhcpv6Enabled,
        handleGoToPage: () => handleGoToPage(RouterPage.WAN, RouterPageKey.DHCPV6_STATUS),
      },
      {
        label: translator.t('popup_label_pd_status'),
        compareMatch: routerPreferencesComparison?.pdEnabled,
        value: data.pdEnabled,
        handleGoToPage: () => handleGoToPage(RouterPage.WAN, RouterPageKey.PD_STATUS),
      },
    );
  }

  const hasData = rows.some((row) => row.value !== undefined && row.value !== null);

  return (
    <Collapsible
      defaultOpen={hasData}
      title={
        <span className="flex items-center gap-1.5">
          <Network className="size-3.5" />
          {translator.t('popup_section_wan')}
        </span>
      }
    >
      <div className="space-y-0.5">
        {rows.map((row, index) => (
          <div key={row.label}>
            {index === 5 && <Separator key={`separator-${index}`} className="my-1" />}
            <PopupDataRow
              key={row.label}
              label={row.label}
              value={row.value}
              compareMatch={row.compareMatch}
              ableToCopy={row.ableToCopy}
              handleGoToPage={row.handleGoToPage}
            />
          </div>
        ))}
      </div>
    </Collapsible>
  );
};
