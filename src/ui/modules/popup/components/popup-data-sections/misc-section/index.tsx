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

interface MiscSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
}

export const MiscSection = ({ data, routerPreferencesComparison }: MiscSectionProps) => {
  const handleGoToRouterVersionUpdate = () => {
    console.log('go to router version update');
  };

  const handleGoToTr069Config = () => {
    console.log('go to tr069 config');
  };

  const handleGoToUpnpConfig = () => {
    console.log('go to upnp config');
  };

  const handleGoToBandSteeringConfig = () => {
    console.log('go to band steering config');
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
      handleGoToSection: () => handleGoToRouterVersionUpdate(),
    },
    {
      label: `${translator.t('popup_label_tr069')} ${translator.t('popup_label_url')}`,
      compareMatch: routerPreferencesComparison?.tr069Url,
      value: val(data.tr069Url),
      ableToCopy: true,
      handleGoToSection: () => handleGoToTr069Config(),
    },
    {
      label: translator.t('popup_section_upnp'),
      compareMatch: routerPreferencesComparison?.upnpEnabled,
      value: data.upnpEnabled,
      handleGoToSection: () => handleGoToUpnpConfig(),
    },
    {
      label: translator.t('popup_section_band_steering'),
      compareMatch: routerPreferencesComparison?.bandSteeringEnabled,
      value: data.bandSteeringEnabled,
      handleGoToSection: () => handleGoToBandSteeringConfig(),
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
            handleGoToSection={row.handleGoToSection}
          />
        ))}
      </div>
    </Collapsible>
  );
};
