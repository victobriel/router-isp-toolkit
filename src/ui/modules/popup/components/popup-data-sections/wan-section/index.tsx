import { ExtractionResult } from '@/domain/schemas/validation';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { Network } from 'lucide-react';
import { PopupDataRow } from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { PopupBoolBadge } from '@/ui/modules/popup/components/popup-data-sections/popup-bool-badge';
import { val } from '@/ui/lib/utils';
import { Separator } from '@/ui/components/ui/separator';
import { translator } from '@/infra/i18n/I18nService';

interface WanSectionProps {
  data: ExtractionResult;
}

export const WanSection = ({ data }: WanSectionProps) => {
  const rows: { label: string; value: string | React.ReactNode }[] = [
    { label: translator.t('popup_label_pppoe'), value: val(data.pppoeUsername) },
    {
      label: translator.t('popup_label_internet'),
      value: <PopupBoolBadge value={data.internetEnabled} />,
    },
    {
      label: translator.t('popup_label_tr069'),
      value: <PopupBoolBadge value={data.tr069Enabled} />,
    },
    { label: translator.t('popup_label_link_speed'), value: val(data.linkSpeed) },
    { label: translator.t('popup_label_ip_version'), value: val(data.ipVersion ?? undefined) },
  ];
  if (data.ipVersion?.includes('6')) {
    rows.push(
      {
        label: translator.t('popup_label_request_pd'),
        value: <PopupBoolBadge value={data.requestPdEnabled} />,
      },
      {
        label: translator.t('popup_label_slaac_status'),
        value: <PopupBoolBadge value={data.slaacEnabled} />,
      },
      {
        label: translator.t('popup_label_dhcpv6_status'),
        value: <PopupBoolBadge value={data.dhcpv6Enabled} />,
      },
      {
        label: translator.t('popup_label_pd_status'),
        value: <PopupBoolBadge value={data.pdEnabled} />,
      },
    );
  }

  return (
    <Collapsible
      defaultOpen
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
            <PopupDataRow key={row.label} label={row.label} value={row.value} />
          </div>
        ))}
      </div>
    </Collapsible>
  );
};
