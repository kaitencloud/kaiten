import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import {
  BillingNotFound,
  BillingRouteError,
  requireBillingCapability,
} from '@/domains/billing';
import {
  PublishableKeysPageContent,
  publishableKeysQueryOptions,
  readPublishableKeysSearch,
} from '@/features/publishable-keys';
import i18n from '@/lib/i18n/config';

// `?includeRevoked=true` lists the revoked keys too, which the API leaves out unless it is
// asked. It is the API's to apply, so it is what the route loads. Anything else in the URL
// is dropped.
export const Route = createFileRoute('/integrations/publishable-keys')({
  component: PublishableKeysLayout,
  // The API's own words for why the keys could not be read (a session without the scope
  // that reads them is told which one), around the console that still works.
  errorComponent: BillingRouteError,
  // Shown in place of the screen where billing is not there, and for a path under
  // /integrations/publishable-keys that is no page.
  notFoundComponent: BillingNotFound,
  validateSearch: (search) => readPublishableKeysSearch(search),
  // The guard of every route under it: the keys exist where GET /billing/capabilities
  // says billing is on. It does not ask for `features.publicSurface` or
  // `publicSurface.enabled`: the API answers the first `true` (the release ships the
  // public catalogue and the keys) and the second as `enabled`
  // (api/internal/modules/billing/getbillingcapabilities), so neither says more than
  // billing being on. What a session may do with the keys is its scopes
  // (`read:publishable_keys`, then `write:publishable_keys`), which the API checks and
  // the screens follow.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient);

    return {
      getTitle: () => i18n.t('Pages.Integrations.PublishableKeys.title'),
    };
  },
  loaderDeps: ({ search }) => ({ includeRevoked: search.includeRevoked }),
  // Loads every key, like the other list pages load theirs.
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      publishableKeysQueryOptions(deps.includeRevoked === true),
    ),
});

// The list is drawn by the layout, so that the dialogs its child routes open stand over
// a list that stays where it was.
function PublishableKeysLayout() {
  const navigate = Route.useNavigate();
  const { includeRevoked } = Route.useSearch();

  return (
    <PublishableKeysPageContent
      includeRevoked={includeRevoked === true}
      onIncludeRevokedChange={(next) =>
        void navigate({
          replace: true,
          search: (previous) => ({
            ...previous,
            includeRevoked: next ? true : undefined,
          }),
        })
      }
    >
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </PublishableKeysPageContent>
  );
}
