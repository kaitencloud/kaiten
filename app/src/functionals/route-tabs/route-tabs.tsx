import { Link, useLocation } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

export type RouteTab = {
  id: string;
  label: string;
  to: string;
  /**
   * For tabs that are one route told apart by its search (`?view=handoff`):
   * the search this tab leads to. The tab that has none is the one the route opens
   * on, and is active when no other tab of the same path matches the search.
   */
  search?: Record<string, string>;
};

type RouteTabsProps = {
  tabs: RouteTab[];
  className?: string;
  listClassName?: string;
  itemClassName?: string;
};

const searchSize = (tab: RouteTab) => Object.keys(tab.search ?? {}).length;

// The tab the location belongs to: the one whose path is the longest prefix of the
// current one and, among tabs that share it, whose search the location carries
// (the one that asks for the most of it winning). A tab with no search is what is
// left when none of them matches.
function findActiveTabId(
  tabs: RouteTab[],
  pathname: string,
  search: Record<string, unknown>,
) {
  const byPath = tabs.filter(
    (tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`),
  );
  const longest = Math.max(0, ...byPath.map((tab) => tab.to.length));

  return byPath
    .filter(
      (tab) =>
        tab.to.length === longest &&
        Object.entries(tab.search ?? {}).every(
          ([key, value]) =>
            search[key] !== undefined && String(search[key]) === value,
        ),
    )
    .sort((a, b) => searchSize(b) - searchSize(a))[0]?.id;
}

export function RouteTabs({
  tabs,
  className,
  listClassName,
  itemClassName,
}: RouteTabsProps) {
  const pathname = useLocation({ select: (location) => location.pathname });
  // The search of the location as a string: the router only hands over what it can
  // compare, and a search is an object whose values it does not know. Tabs that are
  // told apart by their path alone do not read it.
  const readsSearch = tabs.some((tab) => tab.search);
  const searchJson = useLocation({
    select: (location) =>
      readsSearch ? JSON.stringify(location.search) : '{}',
  });
  const search = JSON.parse(searchJson) as Record<string, unknown>;
  const activeTabId = findActiveTabId(tabs, pathname, search);

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
              // The router marks a link current when its path is a prefix of the
              // page's and its search is part of the page's: the Customers tab on an
              // instance, or the two tabs of one route. Which tab the page belongs to
              // is decided above, so the router is asked for whole matches only and
              // the tab says for itself that it is the current one, even where the
              // page spells out what the route opens on (`?status=PENDING`).
              activeOptions={{ exact: true }}
              aria-current={isActive ? 'page' : undefined}
              key={tab.id}
              to={tab.to}
              search={tab.search}
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
