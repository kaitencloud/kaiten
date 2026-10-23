import { useTranslation } from 'react-i18next';
import type { RouteTab } from '@/functionals/route-tabs';
import { useBillingScreenOffered } from './use-billing-screen-offered';

/**
 * The tabs above the pages of the Customers section: the customers, their instances
 * and, where billing is on with the public surface and the session may read the
 * checkouts, the anonymous checkouts that created customers. Each page of the section
 * draws the same row, so the row is written once.
 */
export function useCustomersSectionTabs(): RouteTab[] {
  const { t } = useTranslation();
  const checkoutsOffered = useBillingScreenOffered({
    action: 'checkoutSessions.list',
    feature: 'publicSurface',
  });

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
