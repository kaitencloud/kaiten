import { createFileRoute } from '@tanstack/react-router';
import {
  InstanceDetailEntitlementsTab,
  readEntitlementsSearch,
} from '@/features/instances';
import i18n from '@/lib/i18n/config';

// `?history=<entitlementSlug>` opens the usage history of that entitlement in a
// drawer over the tab, so that it can be linked to, from an invoice that would be
// held for its usage as much as from a row of the table. `from` and `to` are the
// period it is read for: they are the API's filters, so they live in the URL too,
// and a link carries them and a reload keeps them.
export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/entitlements',
)({
  component: InstanceDetailEntitlementsRoute,
  validateSearch: (search) => readEntitlementsSearch(search),
  beforeLoad: () => ({
    getTitle: () =>
      i18n.t('Pages.Customers.Instances.Detail.tabs.entitlements'),
  }),
});

function InstanceDetailEntitlementsRoute() {
  const { from, history, to } = Route.useSearch();

  return (
    <InstanceDetailEntitlementsTab
      historyParam={history}
      historyRange={{ from, to }}
    />
  );
}
