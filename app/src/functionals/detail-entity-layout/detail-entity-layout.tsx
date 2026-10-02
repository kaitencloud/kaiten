import type { HTMLAttributes } from 'react';
import { Page } from '@/functionals/page';
import { cn } from '@/lib/utils';
import { DetailTabsNav } from './detail-tabs-nav';

const Root = ({ children, className }: HTMLAttributes<HTMLDivElement>) => (
  <Page className={cn('h-full overflow-hidden', className)}>{children}</Page>
);

const Top = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex shrink-0 flex-col gap-5', className)} {...props}>
    {children}
  </div>
);

const Body = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('mt-5 flex min-h-0 flex-1 flex-col gap-0', className)}
    {...props}
  >
    {children}
  </div>
);

const Content = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('min-h-0 flex-1 overflow-y-auto pt-3', className)}
    {...props}
  >
    {children}
  </div>
);

export const DetailEntityLayout = Object.assign(Root, {
  Top,
  Body,
  Tabs: DetailTabsNav,
  Content,
});
