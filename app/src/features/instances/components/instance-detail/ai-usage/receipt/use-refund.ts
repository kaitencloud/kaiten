import { useMutation, useQueryClient } from '@tanstack/react-query';
import { refundAiInference } from '@/api-client';
import {
  getEntitlementsUsageMetricsQueryKey,
  listAiInferencesQueryKey,
  listUsageReportsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { refundableCredits } from '../engine';
import { receiptRowOptions } from './use-receipt';

type RefundPath = {
  instanceSlug: string;
  entitlementSlug: string;
  transactionId: string;
};

type RefundInput = {
  credits: string;
  reason: string | undefined;
  /** Sent again, with the same amount and reason, on a retry: the API refunds once. */
  idempotencyKey: string;
};

/**
 * The refund of a charge. It gives credits back to the pool in the window open
 * now, so what it changes is read again as soon as it is made: the pool's usage
 * (the header's figures and meter), every read of the pool's inferences (the
 * feed's pages and the receipt's row share the operation) and the usage journal
 * of the entitlement, where the refund is a row.
 */
export function useRefund({
  instanceSlug,
  entitlementSlug,
  transactionId,
}: RefundPath) {
  const client = useQueryClient();
  const path = { instanceSlug, entitlementSlug };

  /** What a refund made stale, also after a refusal that says the row moved on. */
  function refresh() {
    const [inferences] = listAiInferencesQueryKey({ path });
    const [journal] = listUsageReportsQueryKey({ path });

    return Promise.all([
      client.invalidateQueries({
        queryKey: getEntitlementsUsageMetricsQueryKey({
          path: { instanceSlug },
        }),
      }),
      client.invalidateQueries({
        queryKey: [{ _id: inferences._id, path }],
      }),
      client.invalidateQueries({ queryKey: [{ _id: journal._id, path }] }),
    ]);
  }

  const refund = useMutation({
    mutationFn: async ({ credits, reason, idempotencyKey }: RefundInput) =>
      (
        await refundAiInference({
          body: { credits, ...(reason ? { reason } : {}) },
          headers: { 'Idempotency-Key': idempotencyKey },
          path: { ...path, transactionId },
          throwOnError: true,
        })
      ).data,
    // Not awaited: the refund is made, and the dialog may close on it. Where
    // flags are evaluated by the API itself, a successful write also has the
    // AI area re-check its access, which takes the screens down for a moment;
    // a dialog still waiting on these reads through that was drawn again in
    // a loop. The reads land on whatever is on screen by then.
    onSuccess: () => {
      void refresh();
    },
  });

  /**
   * What the charge has left to give back, asked of the API now and never
   * taken from what the page holds. It throws when the row cannot be read. The
   * receipt shows the row it brings back.
   */
  async function readLeft() {
    const page = await client.fetchQuery({
      ...receiptRowOptions(instanceSlug, entitlementSlug, transactionId),
      staleTime: 0,
    });
    const row = (page.items ?? []).find(
      (item) => item.transactionId === transactionId,
    );
    if (!row) {
      throw new Error('The refunded inference is no longer listed');
    }
    void refresh();

    return row.status === 'COMMITTED' ? refundableCredits(row.credits) : '0';
  }

  return { refund, refresh, readLeft };
}
