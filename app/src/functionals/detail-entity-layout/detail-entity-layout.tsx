import type { PropsWithChildren, ReactNode } from 'react';
import {
  DetailTabsLayout,
  DetailTabsNav,
  type DetailTabsNavItem,
} from '@/functionals/detail-tabs-layout';

type DetailEntityLayoutProps = PropsWithChildren<{
  activeTab: string;
  header: ReactNode;
  stats?: ReactNode;
  tabContentClassName?: string;
  tabs: DetailTabsNavItem[];
}>;

export const DetailEntityLayout = ({
  activeTab,
  children,
  header,
  stats,
  tabContentClassName = 'pt-3',
  tabs,
}: DetailEntityLayoutProps) => (
  <DetailTabsLayout
    topContent={
      <>
        {header}
        {stats}
      </>
    }
    tabsContent={<DetailTabsNav activeTab={activeTab} items={tabs} />}
    tabContentClassName={tabContentClassName}
  >
    {children}
  </DetailTabsLayout>
);
