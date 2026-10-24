import { useTranslation } from 'react-i18next';
import type { RouteTab } from '@/functionals/route-tabs';

/**
 * The tabs above the pages of the Customers section: the customers, their instances and,
 * where the console offers them, the anonymous checkouts that created customers. Each page
 * of the section draws the same row, so the row is written once; whether the checkouts are
 * offered is not this row's to know, the page says it.
 */
export function useCustomersSectionTabs({
  checkoutsOffered,
}: {
  checkoutsOffered: boolean;
}): RouteTab[] {
  const { t } = useTranslation();

  return [
    {
      id: 'customers',
      label: t('Pages.Customers.Tabs.customers'),
      to: '/customers',
    },
    {
      id: 'instances',
      label: t('Pages.Customers.Tabs.instances'),
      to: '/customers/instances',
    },
    ...(checkoutsOffered
      ? [
          {
            id: 'checkout-sessions',
            label: t('Pages.Customers.Tabs.checkoutSessions'),
            to: '/customers/checkout-sessions',
          },
        ]
      : []),
  ];
}
