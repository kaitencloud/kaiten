import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import { useBillingCapabilities } from '@/domains/billing';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { Page } from '@/functionals/page';
import { getActiveTabFromPathname } from '@/lib/detail';

type LicenseDetailPageProps = {
  /** The tab the route renders: its overview, or its prices. */
  children: ReactNode;
  license: License;
  licenseSlug: string;
};

/**
 * The page of one license version, around the tab its route renders. The
 * Prices tab is billing's: it is offered only where billing is, and a link to it
 * where it is not explains why instead (see the guard of its route).
 */
export function LicenseDetailPage({
  children,
  license,
  licenseSlug,
}: LicenseDetailPageProps) {
  const { t } = useTranslation();
  const { isEnabled: hasBilling } = useBillingCapabilities();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeTab = getActiveTabFromPathname({
    defaultTab: 'overview',
    matchers: [{ suffix: '/prices', value: 'prices' }],
    pathname,
  });
  const params = { licenseSlug };
  const tabs = [
    {
      label: t('Pages.Licenses.Detail.Tabs.overview'),
      params,
      to: '/licenses/$licenseSlug',
      value: 'overview',
    },
    ...(hasBilling
      ? [
          {
            label: t('Pages.Licenses.Prices.title'),
            params,
            to: '/licenses/$licenseSlug/prices',
            value: 'prices',
          },
        ]
      : []),
  ];

  // A version with nothing but its overview has no bar of one tab, as it had no
  // bar before it had tabs: it keeps the space the page gave its content then.
  const hasTabs = tabs.length > 1;

  return (
    <DetailEntityLayout>
      <DetailEntityLayout.Top>
        <Page.Header>
          <Page.Title>{license.name}</Page.Title>
        </Page.Header>
      </DetailEntityLayout.Top>
      <DetailEntityLayout.Body>
        {hasTabs ? (
          <DetailEntityLayout.Tabs activeTab={activeTab} items={tabs} />
        ) : null}
        {/* The page owns the space at the end of its tabs, whichever tab is open. */}
        <DetailEntityLayout.Content className={hasTabs ? 'pb-6' : 'pt-1 pb-6'}>
          {children}
        </DetailEntityLayout.Content>
      </DetailEntityLayout.Body>
    </DetailEntityLayout>
  );
}
