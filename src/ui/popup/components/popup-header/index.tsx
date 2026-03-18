import { Button } from '@/ui/components/ui/button';
import { Router, X } from 'lucide-react';

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
        <Router className="size-8 text-primary shrink-0" />
        <div className="min-w-0 flex flex-col">
          <p className="text-sm font-semibold leading-none truncate">Router ISP Toolkit</p>
          <p className="text-xs text-muted-foreground truncate">{routerModel}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClose}
        aria-label="Close"
        className="size-7"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
};
