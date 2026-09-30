import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type DetailTabsNavItem = {
  label: ReactNode;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  to: string;
  value: string;
};

type DetailTabsNavProps = {
  activeTab: string;
  className?: string;
  items: DetailTabsNavItem[];
};

export const DetailTabsNav = ({
  activeTab,
  className,
  items,
}: DetailTabsNavProps) => (
  <Tabs value={activeTab}>
    <TabsList
      variant="line"
      className={cn(
        'sticky top-0 z-10 w-full justify-start overflow-x-auto rounded-none',
        className,
      )}
    >
      {items.map((item) => {
        return (
          <TabsTrigger key={item.value} value={item.value} asChild>
            <Link
              to={item.to as never}
              params={item.params as never}
              search={item.search as never}
              activeOptions={{ exact: true }}
            >
              {item.label}
            </Link>
          </TabsTrigger>
        );
      })}
    </TabsList>
  </Tabs>
);
