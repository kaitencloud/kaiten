import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import { getAddonTitle } from '@/domains/billing';
import {
  AddonDetailPage,
  AddonFormDialog,
  addonQueryOptions,
} from '@/features/addons';

// `?mode=configure` opens the dialog the version is edited in, as it opens the edit
// dialog of the other detail pages. The search stays open: a tab of the version has
// search of its own.
const addonDetailSearchSchema = z
  .object({ mode: z.enum(['configure']).optional() })
  .loose();

export const Route = createFileRoute('/catalog/addons/$addonSlug')({
  component: AddonDetailRouteLayout,
  validateSearch: (search) => addonDetailSearchSchema.parse(search),
  beforeLoad: async ({ context, params: { addonSlug } }) => {
    const addon = await context.queryClient.ensureQueryData(
      addonQueryOptions(addonSlug),
    );

    return { getTitle: () => getAddonTitle(addon) };
  },
  loader: ({ context, params: { addonSlug } }) =>
    context.queryClient.ensureQueryData(addonQueryOptions(addonSlug)),
});

// The page of one version, around the tab its child route renders: its overview, what
// it grants, what it is sold for, or the licenses it fits. A tab loads its own data, so
// that one the session may not read never blanks the page.
function AddonDetailRouteLayout() {
  const navigate = useNavigate();
  const { addonSlug } = Route.useParams();
  const { mode } = Route.useSearch();
  const { data: addon } = useSuspenseQuery(addonQueryOptions(addonSlug));

  const closeConfigure = () => {
    void navigate({
      search: (previous) => ({ ...previous, mode: undefined }),
      to: '.',
    });
  };

  return (
    <AddonDetailPage addon={addon} addonSlug={addonSlug}>
      {mode === 'configure' ? (
        <AddonFormDialog
          addon={addon}
          onClose={closeConfigure}
          onSaved={closeConfigure}
        />
      ) : null}
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </AddonDetailPage>
  );
}
