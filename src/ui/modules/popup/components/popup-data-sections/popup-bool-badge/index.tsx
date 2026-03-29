import { Badge } from '@/ui/components/ui/badge';
import { translator } from '@/infra/i18n/I18nService';
import { Check, X } from 'lucide-react';
import { cn } from '@/ui/lib/utils';

interface PopupBoolBadgeProps {
  value: boolean | undefined;
}

export const PopupBoolBadge = ({ value }: PopupBoolBadgeProps) => {
  if (value === undefined) return '—';
  return (
    <Badge
      variant={value ? 'success' : 'secondary'}
      className="text-sm px-1.5 py-0 w-fit cursor-default"
    >
      {value ? translator.t('popup_status_enabled') : translator.t('popup_status_disabled')}
    </Badge>
  );
};

interface PopupCompareBadgeProps {
  match: boolean;
}

export const PopupCompareBadge = ({ match }: PopupCompareBadgeProps) => {
  return (
    <Badge
      className={cn(
        'cursor-default',
        match ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
      )}
      aria-label={match ? translator.t('popup_compare_ok') : translator.t('popup_compare_not_ok')}
    >
      {match ? <Check className="size-4" /> : <X className="size-4" />}
    </Badge>
  );
};
