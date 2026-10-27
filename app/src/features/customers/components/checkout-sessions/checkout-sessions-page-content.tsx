import { useSuspenseQuery } from '@tanstack/react-query';
import { useCheckoutLabels } from '../../hooks/use-checkout-labels';
import { checkoutSessionsQueryOptions } from '../../queries';
import {
  type CheckoutSessionsSearch,
  toInitialFilterValues,
} from '../../schemas/checkout-sessions-search.schema';
import { CheckoutSessionDrawer } from './checkout-session-drawer';
import { CheckoutSessionsList } from './checkout-sessions-list';
import { CheckoutSessionsPageShell } from './checkout-sessions-page-shell';

type CheckoutSessionsPageContentProps = {
  /** Drops the checkout the panel was opened on from the address. */
  onClose: () => void;
  /** Opens the panel of a checkout, by writing its id to the address. */
  onOpen: (sessionId: string) => void;
  /** Drops the status the address seeded, once the person changed the filter away from it. */
  onStatusSeedDropped: () => void;
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
  onStatusSeedDropped,
  search,
}: CheckoutSessionsPageContentProps) {
  const { data } = useSuspenseQuery(checkoutSessionsQueryOptions());
  const labels = useCheckoutLabels();
  // The row the panel was opened from already knows the e-mail the panel is titled with.
  const listed = search.session
    ? data.items.find((session) => session.sessionId === search.session)
    : undefined;

  return (
    <CheckoutSessionsPageShell>
      <CheckoutSessionsList
        initialFilterValues={toInitialFilterValues(search)}
        labels={labels}
        onOpen={(session) => onOpen(session.sessionId)}
        onStatusSeedDropped={onStatusSeedDropped}
        sessions={data.items}
      />
      {search.session ? (
        <CheckoutSessionDrawer
          labels={labels}
          listedEmail={listed?.email}
          onClose={onClose}
          sessionId={search.session}
        />
      ) : null}
    </CheckoutSessionsPageShell>
  );
}
