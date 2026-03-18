import * as React from 'react';
import { cn } from '@/ui/lib/utils';

interface TabsContextType {
  active: string;
  setActive: (id: string) => void;
}

const TabsContext = React.createContext<TabsContextType>({ active: '', setActive: () => {} });

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ defaultValue = '', value, onValueChange, children, className }: TabsProps) {
  const [internalActive, setInternalActive] = React.useState(defaultValue);
  const active = value !== undefined ? value : internalActive;
  const setActive = (id: string) => {
    if (value === undefined) setInternalActive(id);
    onValueChange?.(id);
  };
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className={cn('', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabsList({ children, className }: TabsListProps) {
  return <div className={cn('flex rounded-md bg-muted p-0.5 gap-0.5', className)}>{children}</div>;
}

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { active, setActive } = React.useContext(TabsContext);
  const isActive = active === value;
  return (
    <button
      type="button"
      className={cn(
        'flex-1 rounded px-3 py-1 text-xs font-medium transition-all',
        isActive
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
        className,
      )}
      onClick={() => setActive(value)}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { active } = React.useContext(TabsContext);
  if (active !== value) return null;
  return <div className={cn('', className)}>{children}</div>;
}
