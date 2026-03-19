import { Collapsible } from '@/ui/components/ui/collapsible';
import { Server } from 'lucide-react';
import { PopupDataRow } from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { PopupBoolBadge } from '@/ui/modules/popup/components/popup-data-sections/popup-bool-badge';
import { ExtractionResult } from '@/domain/schemas/validation';
import { translator } from '@/infra/i18n/I18nService';

interface RemoteAccessSectionProps {
  data: ExtractionResult;
}

export const RemoteAccessSection = ({ data }: RemoteAccessSectionProps) => {
  const rows: { label: string; value: string | React.ReactNode }[] = [
    {
      label: translator.t('popup_label_remote_access_ipv4'),
      value: <PopupBoolBadge value={data.remoteAccessIpv4Enabled} />,
    },
    {
      label: translator.t('popup_label_remote_access_ipv6'),
      value: <PopupBoolBadge value={data.remoteAccessIpv6Enabled} />,
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
          return <PopupDataRow key={row.label} label={row.label} value={row.value} />;
        })}
      </div>
    </Collapsible>
  );
};
