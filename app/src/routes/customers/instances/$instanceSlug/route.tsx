import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import { deploymentZonesQueryOptions } from '@/features/deployment-zones';
import {
  ensureInstanceDetailData,
  InstanceDetailLayout,
  InstanceDetailProvider,
  InstanceFormDialog,
  instanceQueryOptions,
} from '@/features/instances';
import { releasesQueryOptions } from '@/features/releases';

const instanceDetailSearchSchema = z
  .object({
    mode: z.enum(['configure']).optional(),
  })
  .loose();

export const Route = createFileRoute('/customers/instances/$instanceSlug')({
  component: InstanceDetailRouteLayout,
  validateSearch: (search) => instanceDetailSearchSchema.parse(search),
  beforeLoad: async ({ context, params: { instanceSlug } }) => {
    const instance = await context.queryClient.ensureQueryData(
      instanceQueryOptions(instanceSlug),
    );
    return { getTitle: () => instance.name };
  },
  loader: ({ context, params: { instanceSlug } }) => {
    return Promise.all([
      ensureInstanceDetailData(context.queryClient, instanceSlug),
      context.queryClient.ensureQueryData(deploymentZonesQueryOptions),
      context.queryClient.ensureQueryData(
        releaseManagementOverviewQueryOptions,
      ),
      context.queryClient.ensureQueryData(releasesQueryOptions),
    ]);
  },
});

function InstanceDetailRouteLayout() {
  const navigate = useNavigate();
  const { instanceSlug } = Route.useParams();
  const search = Route.useSearch();

  const { data: instance } = useSuspenseQuery(
    instanceQueryOptions(instanceSlug),
  );

  const closeConfigure = () => {
    navigate({
      to: '/customers/instances/$instanceSlug',
      params: { instanceSlug },
    });
  };

  return (
    <InstanceDetailProvider instanceId={instanceSlug}>
      <InstanceDetailLayout instanceId={instanceSlug}>
        {search.mode === 'configure' ? (
          <InstanceFormDialog
            open
            instance={instance}
            onSuccess={closeConfigure}
            onOpenChange={(open) => {
              if (!open) {
                closeConfigure();
              }
            }}
          />
        ) : null}
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </InstanceDetailLayout>
    </InstanceDetailProvider>
  );
}
