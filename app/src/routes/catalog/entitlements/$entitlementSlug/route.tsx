import { isApiError } from '@/lib/errors';
import {
  requireAiAccess,
  useAiAccess,
  isAiEntitlement,
} from '@/domains/ai-credits';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  notFound,
  Outlet,
  useNavigate,
} from '@tanstack/react-router';
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
    const entitlement = await context.queryClient
      .ensureQueryData(entitlementQueryOptions(entitlementSlug))
      .catch((error: unknown) => {
        // A disabled server can refuse the generic target before returning its type.
        if (
          isApiError(error) &&
          (error.data as { code?: string } | null)?.code === 'AIUsage.Disabled'
        )
          throw notFound();
        throw error;
      });

    if (isAiEntitlement(entitlement.type))
      await requireAiAccess(context.queryClient);
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
  const access = useAiAccess();
  const navigate = useNavigate();
  const { entitlementSlug } = Route.useParams();
  const search = Route.useSearch();

  const { data: entitlement } = useSuspenseQuery(
    entitlementQueryOptions(entitlementSlug),
  );

  if (isAiEntitlement(entitlement.type) && !access.available) return null;
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
