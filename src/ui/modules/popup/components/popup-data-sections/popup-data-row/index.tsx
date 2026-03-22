import { translator } from '@/infra/i18n/I18nService';
import { Button } from '@/ui/components/ui/button';
import {
  PopupBoolBadge,
  PopupCompareBadge,
} from '@/ui/modules/popup/components/popup-data-sections/popup-bool-badge';
import { copyTextToClipboard } from '@/ui/utils/clipboard';
import { Copy, SquareArrowOutUpRight } from 'lucide-react';
import { usePopupStatus } from '../../../contexts/popup-status-context';
import { PopupStatusType } from '@/application/types';
import { Separator } from '@/ui/components/ui/separator';

export interface PopupDataRowProps {
  label: string;
  value: string | boolean | undefined;
  compareMatch?: boolean;
  ableToCopy?: boolean;
}

export const PopupDataRow = ({
  label,
  value,
  compareMatch,
  ableToCopy = false,
}: PopupDataRowProps) => {
  const { setStatus, setStatusMessage } = usePopupStatus();

  const handleCopy = () => {
    if (ableToCopy) {
      void copyTextToClipboard(String(value));
      setStatus(PopupStatusType.OK);
      setStatusMessage(translator.t('popup_copy_text_copied_to_clipboard'));
    }
  };

  const handleGoToSection = () => {
    return;
  };

  return (
    <div className="grid grid-cols-[3fr_5fr] items-center justify-between gap-2 py-0.5 h-9">
      <span className="text-sm text-muted-foreground shrink-0 truncate" title={label}>
        {label}
      </span>
      <div className="flex min-w-0 items-center justify-between gap-1">
        {compareMatch !== undefined ? (
          <PopupCompareBadge match={compareMatch} />
        ) : (
          <div className="flex items-center justify-center h-4 w-4.5">
            <Separator orientation="vertical" />
          </div>
        )}
        <div className="flex min-w-0 items-center justify-end gap-1">
          {typeof value === 'boolean' ? (
            <PopupBoolBadge value={value} />
          ) : (
            <span className="min-w-0 flex-1 text-sm font-medium text-right truncate" title={value}>
              {value ?? '-'}
            </span>
          )}
          {ableToCopy && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              aria-label={translator.t('popup_copy_text')}
              disabled={value === undefined}
              className="opacity-50 size-5"
            >
              <Copy className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleGoToSection}
            aria-label={translator.t('popup_go_to_section')}
            className="opacity-50 size-5"
          >
            <SquareArrowOutUpRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
