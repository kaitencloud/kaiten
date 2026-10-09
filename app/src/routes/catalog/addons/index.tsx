import { createFileRoute } from '@tanstack/react-router';
import {
  AddonsPageContent,
  addonFamiliesQueryOptions,
} from '@/features/addons';

export const Route = createFileRoute('/catalog/addons/')({
  component: AddonsPageContent,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(addonFamiliesQueryOptions),
});
