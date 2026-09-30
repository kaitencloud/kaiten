import { createFileRoute } from '@tanstack/react-router';
import {
  LicensesPageContent,
  licenseFamiliesQueryOptions,
  licensesWithInstancesQueryOptions,
} from '@/features/licenses';

export const Route = createFileRoute('/licenses/')({
  component: LicensesPageContent,
  loader: ({ context }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(licensesWithInstancesQueryOptions),
      context.queryClient.ensureQueryData(licenseFamiliesQueryOptions),
    ]);
  },
});
