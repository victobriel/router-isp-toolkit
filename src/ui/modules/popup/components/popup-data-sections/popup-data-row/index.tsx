import { translator } from '@/infra/i18n/I18nService';
import { Button } from '@/ui/components/ui/button';
import {
  PopupBoolBadge,
  PopupCompareBadge,
} from '@/ui/modules/popup/components/popup-data-sections/popup-bool-badge';
import { copyTextToClipboard } from '@/ui/lib/clipboard';
import { ArrowUpRight, Copy, EllipsisVertical, LucideIcon } from 'lucide-react';
import { usePopupStatus } from '@/ui/modules/popup/hooks/use-popup-status';
import { PopupStatusType } from '@/application/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu';

export interface PopupDataRowProps {
  label: string;
  value: string | boolean | undefined;
  compareMatch?: boolean;
  ableToCopy?: boolean;
  handleGoToPage?: () => void;
}

export const PopupDataRow = ({
  label,
  value,
  compareMatch,
  ableToCopy = false,
  handleGoToPage,
}: PopupDataRowProps) => {
  const { setStatus, setStatusMessage } = usePopupStatus();

  const handleCopy = async () => {
    if (ableToCopy) {
      const wasCopied = await copyTextToClipboard(String(value));
      if (!wasCopied) {
        setStatus(PopupStatusType.ERR);
        setStatusMessage(translator.t('popup_error_copy_to_clipboard'));
        return;
      }

      setStatus(PopupStatusType.OK);
      setStatusMessage(translator.t('popup_copy_text_copied_to_clipboard'));
    }
  };

  const menu: {
    label: string;
    value: string;
    icon: LucideIcon;
    onClick: () => void;
  }[] = [
    ...(ableToCopy
      ? [
          {
            label: translator.t('popup_copy_text'),
            value: 'copy_text',
            icon: Copy,
            onClick: () => void handleCopy(),
          },
        ]
      : []),
    ...(handleGoToPage
      ? [
          {
            label: translator.t('popup_go_to_page'),
            value: 'go_to_page',
            icon: ArrowUpRight,
            onClick: handleGoToPage,
          },
        ]
      : []),
  ];

  const singleMenuItem = menu.length === 1 ? menu[0] : undefined;
  const SingleMenuIcon = singleMenuItem?.icon;

  return (
    <div className="grid grid-cols-[3fr_5fr] items-center justify-between gap-2 py-0.5 h-9">
      <span className="text-sm text-muted-foreground shrink-0 truncate" title={label}>
        {label}
      </span>
      <div className="flex min-w-0 items-center justify-between gap-1">
        {compareMatch !== undefined ? (
          <PopupCompareBadge match={compareMatch} />
        ) : (
          <div className="w-6" />
        )}
        <div className="flex min-w-0 items-center justify-end gap-1">
          {typeof value === 'boolean' ? (
            <PopupBoolBadge value={value} />
          ) : (
            <span className="min-w-0 flex-1 text-sm font-medium text-right truncate" title={value}>
              {value ?? '-'}
            </span>
          )}
          {menu.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="opacity-50 size-5">
                  <EllipsisVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {menu.map(({ label, value, icon: Icon, onClick }) => (
                  <DropdownMenuItem key={value} onClick={onClick}>
                    {Icon && <Icon className="size-3.5" />}
                    <span>{label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : singleMenuItem ? (
            <Button
              variant="ghost"
              size="icon"
              className="opacity-50 size-5"
              onClick={singleMenuItem.onClick}
            >
              {SingleMenuIcon ? <SingleMenuIcon className="size-4" /> : null}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
