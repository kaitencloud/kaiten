import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { formatCredits } from '../format';
import { ReceiptCallout } from './receipt-parts';
import { heldRefund } from './refund-attempt';
import { refundBodyOf, refundFormSchema } from './refund-form.schema';
import type { ReceiptPool, ReceiptRefund } from './receipt-view';
import { useRefundFlow } from './use-refund-flow';

type RefundDialogProps = {
  instanceSlug: string;
  pool: ReceiptPool;
  transactionId: string;
  refund: ReceiptRefund;
  onClose: () => void;
};

/**
 * Asks before credits are given back: how many (everything left by default),
 * optionally why, and what happens. A refusal keeps the dialog open with its
 * reason. Once a refund is sent and until the API answers it, its amount and
 * reason cannot be edited: trying again is the same request, which the API
 * refunds once (`useRefundFlow`).
 */
export function RefundDialog({
  instanceSlug,
  pool,
  transactionId,
  refund,
  onClose,
}: RefundDialogProps) {
  const { t } = useTranslation();
  const target = { instanceSlug, entitlementSlug: pool.slug, transactionId };
  // What is left as the dialog knows it: the receipt's figure when it opens,
  // then the row's own once it had to be read again.
  const [left, setLeft] = useState(refund.refundable);
  const [defaults, setDefaults] = useState(() =>
    initialValues(heldRefund(target), refund.refundable),
  );
  const form = useAppForm({
    defaultValues: defaults,
    validators: { onChange: refundFormSchema(left) },
    onSubmit: ({ value }) => flow.send(refundBodyOf(value)),
  });
  const flow = useRefundFlow({
    ...target,
    onClose,
    onReviewed: (fresh) => {
      const next = { credits: fresh, reason: form.state.values.reason };
      setLeft(fresh);
      setDefaults(next);
      form.reset(next);
    },
  });
  // Locked while a request is on its way too: what is shown is what was sent.
  const locked = flow.hold !== null || flow.busy;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="form">
        <DialogHeader>
          <DialogTitle>{t('AI.Receipt.refund.title')}</DialogTitle>
          <DialogDescription>
            {t('AI.Receipt.refund.description', {
              charged: formatCredits(refund.charged),
              id: transactionId,
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={createFormSubmitHandler(form.handleSubmit)}
        >
          <form.AppForm>
            <DialogBody className="space-y-5">
              <form.AppField name="credits">
                {(field) => (
                  <field.TextField
                    autoComplete="off"
                    disabled={locked}
                    inputMode="decimal"
                    label={t('AI.Receipt.refund.amount')}
                    description={
                      flow.hold?.kind === 'UNANSWERED'
                        ? t('AI.Receipt.refund.frozenHelp')
                        : t('AI.Receipt.refund.amountHelp', {
                            left: formatCredits(left),
                          })
                    }
                    required
                  />
                )}
              </form.AppField>
              <form.AppField name="reason">
                {(field) => (
                  <field.TextAreaField
                    disabled={locked}
                    label={t('AI.Receipt.refund.reason')}
                    description={t('AI.Receipt.refund.reasonHelp')}
                  />
                )}
              </form.AppField>
              <ReceiptCallout>
                <p>{t('AI.Receipt.refund.explain', { pool: pool.name })}</p>
              </ReceiptCallout>
              {flow.message ? (
                <p
                  role="alert"
                  className="rounded-lg bg-destructive-subtle p-3 text-sm text-destructive-subtle-foreground"
                >
                  {flow.message}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('Common.cancel')}
              </Button>
              {flow.hold?.kind === 'UNANSWERED' ? (
                <Button
                  type="button"
                  disabled={flow.busy}
                  onClick={() => void flow.resend()}
                >
                  {t('AI.Receipt.refund.resend')}
                </Button>
              ) : flow.hold?.kind === 'UNREAD' ? (
                <Button
                  type="button"
                  disabled={flow.busy}
                  onClick={() => void flow.review()}
                >
                  {t('AI.Receipt.refund.readAgain')}
                </Button>
              ) : (
                <form.SubmitButton
                  allowPristine
                  disabled={flow.busy}
                  label={t('AI.Receipt.refund.confirm')}
                  needsInputHint={t('AI.Receipt.refund.fixAmount')}
                />
              )}
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A refund still unanswered opens on what it carried; any other on what is left. */
function initialValues(
  hold: ReturnType<typeof heldRefund>,
  refundable: string,
) {
  return hold?.kind === 'UNANSWERED'
    ? { credits: hold.body.credits, reason: hold.body.reason ?? '' }
    : { credits: refundable, reason: '' };
}
