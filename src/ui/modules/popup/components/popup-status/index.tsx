import { PopupStatusType } from '@/application/types';
import { cn } from '@/ui/lib/utils';
import { usePopupStatus } from '@/ui/modules/popup/contexts/popup-status-context';

export const PopupStatus = () => {
  const { status, statusMessage } = usePopupStatus();

  return (
    <div
      className={cn('px-4 py-2 text-sm border-b border-border shrink-0 flex items-center gap-2', {
        'bg-muted/30': status === PopupStatusType.NONE,
        'bg-success/10 text-success': status === PopupStatusType.OK,
        'bg-warning/10 text-warning': status === PopupStatusType.WARN,
        'bg-destructive/10 text-destructive': status === PopupStatusType.ERR,
      })}
    >
      <span
        className={cn('inline-block h-2 w-2 rounded-full shrink-0', {
          'bg-muted-foreground': status === PopupStatusType.NONE,
          'bg-success': status === PopupStatusType.OK,
          'bg-warning': status === PopupStatusType.WARN,
          'bg-destructive': status === PopupStatusType.ERR,
        })}
      />
      <span className="truncate">{statusMessage}</span>
    </div>
  );
};
