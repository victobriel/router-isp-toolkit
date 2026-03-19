import { Badge } from '@/ui/components/ui/badge';
import { translator } from '@/infra/i18n/I18nService';

interface PopupBoolBadgeProps {
  value: boolean | undefined;
}

export const PopupBoolBadge = ({ value }: PopupBoolBadgeProps) => {
  if (value === undefined) return <span className="text-muted-foreground text-xs">-</span>;
  return (
    <Badge variant={value ? 'success' : 'secondary'} className="text-xs px-1.5 py-0">
      {value ? translator.t('popup_status_enabled') : translator.t('popup_status_disabled')}
    </Badge>
  );
};
