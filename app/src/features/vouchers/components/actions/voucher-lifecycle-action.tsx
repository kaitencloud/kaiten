import type { Voucher } from '@/api-client';
import { useCanPerform, VersionLifecycleAction } from '@/domains/billing';
import { useVoucherTransitions } from '../../hooks/use-voucher-transitions';
import { VOUCHER_TRANSITION_KEYS } from '../../utils/voucher-labels';

type VoucherLifecycleActionProps = {
  transition: 'archive' | 'publish';
  voucher: Pick<Voucher, 'id' | 'name'>;
};

/**
 * Publish a draft, or archive a voucher, confirmed first: publishing makes the code
 * redeemable and archiving ends every further redemption, and each is announced to the
 * webhooks. The action is there for a session that may write vouchers. What happened
 * shows once the page has read the voucher again, not before.
 */
export function VoucherLifecycleAction({
  transition,
  voucher,
}: VoucherLifecycleActionProps) {
  const { archive, publish } = useVoucherTransitions(voucher.id);
  const allowed = useCanPerform(
    transition === 'publish' ? 'vouchers.publish' : 'vouchers.archive',
  );

  return (
    <VersionLifecycleAction
      appearance="card"
      available={allowed}
      isPending={archive.isPending || publish.isPending}
      keys={VOUCHER_TRANSITION_KEYS}
      name={voucher.name}
      onConfirm={({ slug, transition: asked }) =>
        (asked === 'publish' ? publish : archive).mutate({
          path: { voucherId: slug },
        })
      }
      slug={voucher.id}
      transition={transition}
      version={undefined}
    />
  );
}
