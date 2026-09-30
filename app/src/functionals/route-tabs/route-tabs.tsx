import { Link, useLocation } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

export type RouteTab = {
  id: string;
  label: string;
  to: string;
};

type RouteTabsProps = {
  tabs: RouteTab[];
  className?: string;
  listClassName?: string;
  itemClassName?: string;
};

export function RouteTabs({
  tabs,
  className,
  listClassName,
  itemClassName,
}: RouteTabsProps) {
  const currentPath = useLocation({
    select: (location) => location.pathname,
  });

  const activeTabId = tabs
    .filter(
      (tab) => currentPath === tab.to || currentPath.startsWith(`${tab.to}/`),
    )
    .sort((a, b) => b.to.length - a.to.length)[0]?.id;

  return (
    <div className={cn('mt-6', className)}>
      <div
        className={cn(
          'inline-flex h-11 items-center gap-1 rounded-xl border border-border/70 bg-secondary px-1 py-1 shadow-xs',
          listClassName,
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <Link
              key={tab.id}
              to={tab.to}
              className={cn(
                'inline-flex h-full items-center justify-center rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-all',
                isActive
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                itemClassName,
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
