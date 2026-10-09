import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import {
  VoucherDetailPage,
  VoucherEditDialog,
  voucherQueryOptions,
} from '@/features/vouchers';

// `?mode=configure` opens the dialog a published voucher is changed in, as it opens the
// edit dialog of the other detail pages.
const voucherDetailSearchSchema = z
  .object({ mode: z.enum(['configure']).optional() })
  .loose();

export const Route = createFileRoute('/vouchers/$voucherId/')({
  component: VoucherDetailRoute,
  validateSearch: (search) => voucherDetailSearchSchema.parse(search),
});

function VoucherDetailRoute() {
  const navigate = useNavigate();
  const { voucherId } = Route.useParams();
  const { mode } = Route.useSearch();
  const { data: voucher } = useSuspenseQuery(voucherQueryOptions(voucherId));

  const closeConfigure = () => {
    void navigate({
      search: (previous) => ({ ...previous, mode: undefined }),
      to: '.',
    });
  };

  return (
    <VoucherDetailPage voucherId={voucherId}>
      {mode === 'configure' ? (
        <VoucherEditDialog onClose={closeConfigure} voucher={voucher} />
      ) : null}
    </VoucherDetailPage>
  );
}
