import { ExtractionResult } from '@/domain/schemas/validation';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { val } from '@/ui/lib/utils';
import { Router } from 'lucide-react';
import { PopupBoolBadge } from '@/ui/modules/popup/components/popup-data-sections/popup-bool-badge';
import { PopupDataRow } from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { translator } from '@/infra/i18n/I18nService';

interface MiscSectionProps {
  data: ExtractionResult;
}

export const MiscSection = ({ data }: MiscSectionProps) => {
  const rows: { label: string; value: string | React.ReactNode }[] = [
    { label: translator.t('popup_label_version'), value: val(data.routerVersion) },
    {
      label: `${translator.t('popup_label_tr069')} ${translator.t('popup_label_url')}`,
      value: val(data.tr069Url),
    },
    {
      label: translator.t('popup_section_upnp'),
      value: <PopupBoolBadge value={data.upnpEnabled} />,
    },
    {
      label: translator.t('popup_section_band_steering'),
      value: <PopupBoolBadge value={data.bandSteeringEnabled} />,
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
          <PopupDataRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </Collapsible>
  );
};
