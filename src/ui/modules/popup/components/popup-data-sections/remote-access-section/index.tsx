import { Collapsible } from '@/ui/components/ui/collapsible';
import { Server } from 'lucide-react';
import {
  PopupDataRow,
  PopupDataRowProps,
} from '@/ui/modules/popup/components/popup-data-sections/popup-data-row';
import { ExtractionResult } from '@/domain/schemas/validation';
import { translator } from '@/infra/i18n/I18nService';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/components/popup-data-provider';

interface RemoteAccessSectionProps {
  data: ExtractionResult;
  routerPreferencesComparison: RouterPreferencesComparison | null;
}

export const RemoteAccessSection = ({
  data,
  routerPreferencesComparison,
}: RemoteAccessSectionProps) => {
  const handleGoToRemoteAccessIpv4Config = () => {
    console.log('go to remote access ipv4 config');
  };

  const handleGoToRemoteAccessIpv6Config = () => {
    console.log('go to remote access ipv6 config');
  };

  const rows: PopupDataRowProps[] = [
    {
      label: translator.t('popup_label_remote_access_ipv4'),
      compareMatch: routerPreferencesComparison?.remoteAccessIpv4Enabled,
      value: data.remoteAccessIpv4Enabled,
      handleGoToSection: () => handleGoToRemoteAccessIpv4Config(),
    },
    {
      label: translator.t('popup_label_remote_access_ipv6'),
      compareMatch: routerPreferencesComparison?.remoteAccessIpv6Enabled,
      value: data.remoteAccessIpv6Enabled,
      handleGoToSection: () => handleGoToRemoteAccessIpv6Config(),
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
              handleGoToSection={row.handleGoToSection}
            />
          );
        })}
      </div>
    </Collapsible>
  );
};
