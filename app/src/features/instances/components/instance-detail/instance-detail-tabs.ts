import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { getActiveTabFromPathname } from '@/lib/detail';

/**
 * The tabs of an instance and the one the URL is on. A tab is an entry of
 * `DetailEntityLayout.Tabs`: its label, the route it leads to and its value.
 */
export function useInstanceDetailTabs(instanceId: string) {
  const { t } = useTranslation();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeTab = getActiveTabFromPathname({
    defaultTab: 'overview',
    matchers: [
      { suffix: '/entitlements', value: 'entitlements' },
      { suffix: '/audit-trail', value: 'audit-trail' },
    ],
    pathname,
  });
  const params = { instanceSlug: instanceId };
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
    {
      label: t('Pages.Customers.Instances.Detail.tabs.auditTrail'),
      params,
      to: '/customers/instances/$instanceSlug/audit-trail' as const,
      value: 'audit-trail',
    },
  ];

  return { activeTab, items };
}
