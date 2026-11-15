import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage, isApiError, isProblem } from '@/lib/errors';
import { formatCredits } from '../format';
import {
  heldRefund,
  holdRefund,
  isDefinitiveRefusal,
  type RefundBody,
  type RefundHold,
} from './refund-attempt';
import { useRefund } from './use-refund';

type RefundFlowOptions = {
  instanceSlug: string;
  entitlementSlug: string;
  transactionId: string;
  onClose: () => void;
  /** The row was read again after an earlier refund showed: start from `left`. */
  onReviewed: (left: string) => void;
};

const KEY_REUSED = 'RefundAiInference.IdempotencyKeyReused';
const newKey = () => `refund-${crypto.randomUUID()}`;

/** The API's refusal, when it answered a problem document. */
function problemOf(error: unknown) {
  return isApiError(error) && isProblem(error.data) ? error.data : null;
}

/**
 * The sending of a refund, so that one click never gives back twice.
 *
 * A request is sent under an idempotency key. Until the API answers it
 * definitively, the amount and the reason it carried are frozen: sending again
 * is the same request under the same key, which the API answers with the first
 * refund. A definitive refusal wrote nothing, so the form opens again.
 *
 * Should the API still say the key holds another refund, an earlier one
 * probably went through: nothing more is sent before the row is read again,
 * and the form then starts over from what is left, under a new key.
 */
export function useRefundFlow({
  instanceSlug,
  entitlementSlug,
  transactionId,
  onClose,
  onReviewed,
}: RefundFlowOptions) {
  const { t } = useTranslation();
  const target = { instanceSlug, entitlementSlug, transactionId };
  const [hold, setHold] = useState<RefundHold | null>(() => heldRefund(target));
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    hold?.kind === 'UNANSWERED' ? hold.key : newKey(),
  );
  const [message, setMessage] = useState<string | null>(() =>
    hold === null
      ? null
      : hold.kind === 'UNANSWERED'
        ? t('AI.Receipt.refund.unanswered')
        : t('AI.Receipt.refund.earlierUnread'),
  );
  const [reading, setReading] = useState(false);
  const writes = useRefund(target);

  function keep(next: RefundHold | null) {
    holdRefund(target, next);
    setHold(next);
  }

  /** Reads the row again; only a row read lifts an `UNREAD` hold. */
  async function review() {
    setReading(true);
    try {
      const fresh = await writes.readLeft();
      keep(null);
      setIdempotencyKey(newKey());
      if (fresh === '0') {
        toast.warning(t('AI.Receipt.refund.earlierNothingLeft'));
        onClose();
        return;
      }
      onReviewed(fresh);
      setMessage(
        t('AI.Receipt.refund.earlier', { left: formatCredits(fresh) }),
      );
    } catch {
      setMessage(t('AI.Receipt.refund.earlierUnread'));
    } finally {
      setReading(false);
    }
  }

  async function send(body: RefundBody) {
    setMessage(null);
    // Held before the request leaves, where a closed dialog finds it again:
    // whatever happens to the answer, only this request goes under this key.
    const unanswered = {
      kind: 'UNANSWERED',
      key: idempotencyKey,
      body,
    } as const;
    holdRefund(target, unanswered);
    try {
      const created = await writes.refund.mutateAsync({
        ...body,
        idempotencyKey,
      });
      keep(null);
      toast.success(
        t('AI.Receipt.refund.success', {
          amount: formatCredits(created.credits),
        }),
      );
      onClose();
    } catch (error) {
      const problem = problemOf(error);
      if (problem?.code === KEY_REUSED) {
        keep({ kind: 'UNREAD' });
        await review();
        return;
      }
      if (!isDefinitiveRefusal(error)) {
        setHold(unanswered);
        setMessage(t('AI.Receipt.refund.unanswered'));
        // Should the reads get through, the receipt shows whether it did.
        void writes.refresh();
        return;
      }
      keep(null);
      const stillLeft = problem?.errors?.[0]?.value;
      setMessage(
        problem?.code === 'RefundAiInference.ExceedsRefundable' &&
          (typeof stillLeft === 'string' || typeof stillLeft === 'number')
          ? t('AI.Receipt.refund.exceedsLeft', {
              left: formatCredits(stillLeft),
            })
          : getApiErrorMessage(error),
      );
      if (problem?.code?.startsWith('RefundAiInference.')) {
        void writes.refresh();
      }
    }
  }

  return {
    busy: reading || writes.refund.isPending,
    hold,
    message,
    resend: () => (hold?.kind === 'UNANSWERED' ? send(hold.body) : undefined),
    review,
    send,
  };
}
