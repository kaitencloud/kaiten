import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCustomersSectionTabs } from '@/domains/billing';
import { Page } from '@/functionals/page';
import { RouteTabs } from '@/functionals/route-tabs';
import { dataModelIcons } from '@/lib/data-model-icons';
import { usePublishableKeyLabels } from '../../hooks/use-publishable-key-labels';
import { checkoutSessionsQueryOptions } from '../../queries';
import {
  type CheckoutSessionsSearch,
  toInitialFilterValues,
} from '../../schemas/checkout-sessions-search.schema';
import { CheckoutSessionDrawer } from './checkout-session-drawer';
import { CheckoutSessionsList } from './checkout-sessions-list';

type CheckoutSessionsPageContentProps = {
  /** Drops the checkout the panel was opened on from the address. */
  onClose: () => void;
  /** Opens the panel of a checkout, by writing its id to the address. */
  onOpen: (sessionId: string) => void;
  /** What the address holds: the filter the list opens with and the checkout open over it. */
  search: CheckoutSessionsSearch;
};

/**
 * The anonymous checkouts under Customers: each completed one is a new customer, so the
 * view sits beside the customers and their instances. The route loads the list, like the
 * other list pages load theirs, and the list filters, sorts and pages it; a row opens the
 * panel of its checkout over the list.
 */
export function CheckoutSessionsPageContent({
  onClose,
  onOpen,
  search,
}: CheckoutSessionsPageContentProps) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(checkoutSessionsQueryOptions());
  const { labels } = usePublishableKeyLabels();
  const tabs = useCustomersSectionTabs();
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
      <div className="min-h-0 flex-1">
        <CheckoutSessionsList
          initialFilterValues={toInitialFilterValues(search)}
          keyLabels={labels}
          onOpen={(session) => onOpen(session.sessionId)}
          sessions={data.items}
        />
      </div>
      {search.session ? (
        <CheckoutSessionDrawer
          keyLabels={labels}
          onClose={onClose}
          sessionId={search.session}
        />
      ) : null}
    </Page>
  );
}
