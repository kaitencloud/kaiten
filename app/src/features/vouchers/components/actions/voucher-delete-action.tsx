import type { Voucher } from '@/api-client';
import { useCanPerform, VersionDraftDeleteAction } from '@/domains/billing';
import { useDeleteVoucher } from '../../hooks/use-delete-voucher';
import { VOUCHER_DELETE_KEYS } from '../../utils/voucher-labels';

type VoucherDeleteActionProps = {
  voucher: Pick<Voucher, 'id' | 'name' | 'redemptionsCount'>;
};

/**
 * Deletes a voucher no instance ever redeemed, whatever its state, confirmed first: its
 * code can then be given to another voucher. One redeemed at least once is history and is
 * archived instead, so nothing is offered for it. A checkout waiting for its payment can
 * still hold one that reads unredeemed: the API refuses, and its words are what the
 * person reads.
 */
export function VoucherDeleteAction({ voucher }: VoucherDeleteActionProps) {
  const allowed = useCanPerform('vouchers.delete');
  const { isPending, mutate } = useDeleteVoucher(voucher.id);

  return (
    <VersionDraftDeleteAction
      appearance="card"
      isPending={isPending}
      keys={VOUCHER_DELETE_KEYS}
      name={voucher.name}
      offered={allowed && voucher.redemptionsCount === 0}
      onDelete={(voucherId) => mutate({ path: { voucherId } })}
      slug={voucher.id}
      version={undefined}
    />
  );
}
