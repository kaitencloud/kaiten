import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useBillingCapabilities, useCanPerform } from '@/domains/billing';
import { getActiveTabFromPathname } from '@/lib/detail';

/**
 * The tabs of an instance and the one the URL is on. A tab is an entry of
 * `DetailEntityLayout.Tabs`: its label, the route it leads to and its value.
 *
 * The Billing tab is there only where billing is, and only for a session that may
 * read it: it is absent, not empty, where billing is off or the scope is missing,
 * and a link to it explains why (see the guard of its route).
 */
export function useInstanceDetailTabs(instanceSlug: string) {
  const { t } = useTranslation();
  const { isEnabled: hasBilling } = useBillingCapabilities();
  const mayReadBilling = useCanPerform('subscription.read');
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // The tab is read from what follows the instance in the path, so that an
  // instance named like a tab (`/customers/instances/billing`) is on its Overview.
  // The Billing tab has a dialog under it (`/billing/subscribe`), and is the tab
  // of every path from `/billing` down, and not only of the one that ends there.
  const activeTab = getActiveTabFromPathname({
    basePath: `/customers/instances/${instanceSlug}`,
    defaultTab: 'overview',
    matchers: [
      { suffix: '/entitlements', value: 'entitlements' },
      { suffix: '/billing', value: 'billing' },
      { suffix: '/audit-trail', value: 'audit-trail' },
    ],
    pathname,
  });
  const params = { instanceSlug };
  const items = [
    {
      label: t('Pages.Customers.Instances.Detail.tabs.overview'),
      params,
      to: '/customers/instances/$instanceSlug' as const,
      value: 'overview',
    },
    {
      label: t('Pages.Customers.Instances.Detail.tabs.entitlements'),
      params,
      to: '/customers/instances/$instanceSlug/entitlements' as const,
      value: 'entitlements',
    },
    ...(hasBilling && mayReadBilling
      ? [
          {
            label: t('Pages.Customers.Instances.Detail.tabs.billing'),
            params,
            to: '/customers/instances/$instanceSlug/billing' as const,
            value: 'billing',
          },
        ]
      : []),
    {
      label: t('Pages.Customers.Instances.Detail.tabs.auditTrail'),
      params,
      to: '/customers/instances/$instanceSlug/audit-trail' as const,
      value: 'audit-trail',
    },
  ];

  return { activeTab, items };
}
