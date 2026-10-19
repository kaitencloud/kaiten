import { createFileRoute } from '@tanstack/react-router';
import { allLicenseFamiliesOptions } from '@/lib/api/all-pages-query-options';
import { MatrixPage } from '@/features/ai';
export const Route = createFileRoute('/ai/matrix/')({
  component: MatrixPage,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(allLicenseFamiliesOptions()),
});
