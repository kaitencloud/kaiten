import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import {
  EntitlementDetailPageContent,
  EntitlementFormDialog,
  entitlementGroupsQueryOptions,
  entitlementQueryOptions,
} from '@/features/entitlements';

const entitlementDetailSearchSchema = z
  .object({
    mode: z.enum(['configure']).optional(),
  })
  .loose();

export const Route = createFileRoute('/catalog/entitlements/$entitlementSlug')({
  component: EntitlementDetailRouteLayout,
  validateSearch: (search) => entitlementDetailSearchSchema.parse(search),
  beforeLoad: async ({ context, params: { entitlementSlug } }) => {
    const entitlement = await context.queryClient.ensureQueryData(
      entitlementQueryOptions(entitlementSlug),
    );

    return { getTitle: () => entitlement.name };
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        entitlementQueryOptions(params.entitlementSlug),
      ),
      context.queryClient.ensureQueryData(entitlementGroupsQueryOptions),
    ]),
});

function EntitlementDetailRouteLayout() {
  const navigate = useNavigate();
  const { entitlementSlug } = Route.useParams();
  const search = Route.useSearch();

  const { data: entitlement } = useSuspenseQuery(
    entitlementQueryOptions(entitlementSlug),
  );

  return (
    <EntitlementDetailPageContent
      entitlement={entitlement}
      entitlementSlug={entitlementSlug}
    >
      {search.mode === 'configure' ? (
        <EntitlementFormDialog
          open
          entitlement={entitlement}
          onSuccess={() => {
            navigate({
              to: '/catalog/entitlements/$entitlementSlug',
              params: { entitlementSlug },
            });
          }}
          onOpenChange={(open) => {
            if (!open) {
              navigate({
                to: '/catalog/entitlements/$entitlementSlug',
                params: { entitlementSlug },
              });
            }
          }}
        />
      ) : null}
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </EntitlementDetailPageContent>
  );
}
