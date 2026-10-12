import { createFileRoute } from '@tanstack/react-router';
import {
  EntitlementsPageContent,
  entitlementsQueryOptions,
} from '@/features/entitlements';

export const Route = createFileRoute('/catalog/entitlements/')({
  component: EntitlementsPageContent,
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(entitlementsQueryOptions);
  },
});
