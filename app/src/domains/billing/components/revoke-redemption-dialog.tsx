import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Redemption } from '@/api-client';
import { revokeInstanceVoucherMutation } from '@/api-client/@tanstack/react-query.gen';
import { zRevocationReason } from '@/api-client/zod.gen';
import { useBoundaryRetry } from '../hooks/use-boundary-retry';
import { reasonSchema } from '../logic/reason';
import { invalidateInstanceVoucherQueries } from '../queries/billing-query-invalidation';
import { BoundaryClosingNotice } from './boundary-closing-notice';
import { ReasonDialog } from './reason-dialog';

// The body of the request, with the reason an audited action takes: one to five hundred
// characters of something a person wrote.
const revokeSchema = zRevocationReason
  .pick({ reason: true })
  .extend({ reason: reasonSchema });

type RevokeRedemptionDialogProps = {
  onClose: () => void;
  redemption: Pick<
    Redemption,
    'id' | 'instanceSlug' | 'voucherId' | 'voucherName'
  >;
};

/**
 * Takes a redemption back, with the reason it is taken back for. It is audited: the API
 * requires the reason and keeps it with who gave it. A boost ends at once, a discount
 * applies to no further invoice, the invoices already issued are not touched and the
 * voucher keeps counting the redemption. The dialog stays open with what was typed when
 * the API refuses, and waits out a period being closed as every change to an instance
 * that bills does. What it changes shows on the page behind it: the redemptions, the
 * voucher and the effective values of the instance are read again.
 */
export function RevokeRedemptionDialog({
  onClose,
  redemption,
}: RevokeRedemptionDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const revoke = useMutation(revokeInstanceVoucherMutation());
  const { closing, send } = useBoundaryRetry();

  async function revokeWith(reason: string) {
    await send(() =>
      revoke.mutateAsync({
        body: { reason },
        path: {
          instanceSlug: redemption.instanceSlug,
          instanceVoucherId: redemption.id,
        },
      }),
    );
    await invalidateInstanceVoucherQueries(
      queryClient,
      redemption.instanceSlug,
      redemption.voucherId,
    );
    toast.success(
      t('Features.Billing.Redemptions.Revoke.success', {
        name: redemption.voucherName,
      }),
    );
  }

  return (
    <ReasonDialog
      confirmLabel={t('Features.Billing.Redemptions.Revoke.confirm')}
      description={t('Features.Billing.Redemptions.Revoke.description')}
      destructive
      fieldLabel={t('Features.Billing.Redemptions.Revoke.reason')}
      onClose={onClose}
      onSubmit={revokeWith}
      schema={revokeSchema}
      title={t('Features.Billing.Redemptions.Revoke.title', {
        instance: redemption.instanceSlug,
        name: redemption.voucherName,
      })}
    >
      {closing ? <BoundaryClosingNotice /> : null}
    </ReasonDialog>
  );
}
