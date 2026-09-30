import type { PropsWithChildren, ReactNode } from 'react';
import { Page } from '@/functionals/page';
import { cn } from '@/lib/utils';

type DetailTabsLayoutProps = PropsWithChildren<{
  className?: string;
  tabContentClassName?: string;
  tabsContainerClassName?: string;
  tabsContent: ReactNode;
  topContent: ReactNode;
  topContentClassName?: string;
}>;

export function DetailTabsLayout({
  children,
  className,
  tabContentClassName,
  tabsContainerClassName,
  tabsContent,
  topContent,
  topContentClassName,
}: DetailTabsLayoutProps) {
  return (
    <Page className={cn('h-full overflow-hidden', className)}>
      <div className={cn('flex shrink-0 flex-col gap-5', topContentClassName)}>
        {topContent}
      </div>

      <div
        className={cn(
          'mt-5 flex min-h-0 flex-1 flex-col gap-0',
          tabsContainerClassName,
        )}
      >
        {tabsContent}
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto pt-3',
            tabContentClassName,
          )}
        >
          {children}
        </div>
      </div>
    </Page>
  );
}
