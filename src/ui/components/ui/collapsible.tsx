import * as React from 'react';
import { cn } from '@/ui/lib/utils';
import { ChevronDown } from 'lucide-react';

interface CollapsibleProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerExtra?: React.ReactNode;
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  className,
  headerExtra,
}: CollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className={cn('border border-border rounded-md overflow-hidden', className)}>
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {title}
          {headerExtra}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="border-t border-border bg-card px-3 py-2">{children}</div>}
    </div>
  );
}
