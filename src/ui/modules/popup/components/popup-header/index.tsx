import { Button } from '@/ui/components/ui/button';
import { Router, X } from 'lucide-react';
import { translator } from '@/infra/i18n/I18nService';

interface PopupHeaderProps {
  routerModel: string;
}

export const PopupHeader = ({ routerModel }: PopupHeaderProps) => {
  const handleClose = () => {
    window.parent.postMessage({ type: 'router-isp-toolkit-close' }, '*');
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-2 px-2">
        <Router className="size-7 text-primary shrink-0" />
        <div className="min-w-0 flex flex-col justify-between h-full">
          <p className="text-sm font-semibold leading-none truncate">
            {translator.t('popup_title')}
          </p>
          <p className="text-xs text-muted-foreground truncate">{routerModel}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClose}
        aria-label={translator.t('popup_close_aria_label')}
        className="size-7"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
};
