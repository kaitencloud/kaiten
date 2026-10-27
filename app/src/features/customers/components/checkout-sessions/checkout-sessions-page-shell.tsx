import type { ErrorComponentProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BillingRouteError,
  PagedListSkeleton,
  useCheckoutSessionsOffered,
} from '@/domains/billing';
import { useCustomersSectionTabs } from '@/domains/customer-management';
import { Page } from '@/functionals/page';
import { RouteTabs } from '@/functionals/route-tabs';
import { dataModelIcons } from '@/lib/data-model-icons';

/**
 * What stays on the page of the checkouts whatever happens to its list: the title and the
 * tabs of the Customers section. The list, its refusal and the wait for it are drawn in
 * the content area under them, so the tabs are always there to leave by and nothing
 * moves when the list arrives.
 */
export function CheckoutSessionsPageShell({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const tabs = useCustomersSectionTabs({
    checkoutsOffered: useCheckoutSessionsOffered(),
  });
  const CheckoutIcon = dataModelIcons.checkoutSession;

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <CheckoutIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>
              {t('Pages.Customers.CheckoutSessions.title')}
            </Page.Title>
            <Page.Subtitle>
              {t('Pages.Customers.CheckoutSessions.subtitle')}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <RouteTabs tabs={tabs} />
      <div className="min-h-0 flex-1">{children}</div>
    </Page>
  );
}

/**
 * The `errorComponent` of the route: the API's own words for why the checkouts could not
 * be read (a session without the scope that reads them is told which one), under the title
 * and the tabs, which still work.
 */
export function CheckoutSessionsRouteError({ error }: ErrorComponentProps) {
  return (
    <CheckoutSessionsPageShell>
      <BillingRouteError error={error} />
    </CheckoutSessionsPageShell>
  );
}

/** The `pendingComponent` of the route: the page as it will be, with rows to come. */
export function CheckoutSessionsRoutePending() {
  const { t } = useTranslation();

  return (
    <CheckoutSessionsPageShell>
      <PagedListSkeleton
        label={t('Pages.Customers.CheckoutSessions.loading')}
        rows={6}
        rowClassName="h-12"
      />
    </CheckoutSessionsPageShell>
  );
}
