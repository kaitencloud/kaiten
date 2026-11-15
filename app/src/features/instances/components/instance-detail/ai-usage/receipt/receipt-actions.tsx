import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import { useAiAccess } from '@/domains/ai-credits';
import { formatCredits } from '../format';
import { AddExternalIdDialog } from './add-external-id-dialog';
import { type ReceiptAction, receiptAction } from './receipt-links';
import type { ReceiptView } from './receipt-view';
import { RefundDialog } from './refund-dialog';

function ActionLink({ action }: { action: ReceiptAction }) {
  const { t } = useTranslation();
  switch (action.kind) {
    case 'OPEN_RULE':
      return (
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link to="/ai/pricing" search={action.search} />}
        >
          {t('AI.Receipt.actions.openRule')}
        </Button>
      );
    case 'PRICE_IT':
      return (
        <Button
          nativeButton={false}
          render={<Link to="/ai/pricing" search={action.search} />}
        >
          {t('AI.Receipt.actions.priceIt')}
        </Button>
      );
    case 'OPEN_MODEL':
      return (
        <Button
          nativeButton={false}
          variant="outline"
          render={
            <Link
              to="/ai/models/$modelSlug/edit"
              params={{ modelSlug: action.modelSlug }}
            />
          }
        >
          {t('AI.Receipt.actions.openModel')}
        </Button>
      );
    case 'OPEN_MODELS':
      return (
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link to="/ai/models" />}
        >
          {t('AI.Receipt.actions.openModels')}
        </Button>
      );
  }
}

type ReceiptActionsProps = {
  instanceSlug: string;
  models: readonly Model[];
  view: ReceiptView;
};

/**
 * What a receipt lets its reader do, each offered only to a session that may:
 * refund what is left of a charge (the scope of `refundAiInference`), name an
 * unknown model as an external id of a catalogue model (the scope of
 * `updateModel`), and the link to where
 * the price or the model is. A charge with nothing left to refund, or a call
 * that was never committed, has no refund to offer: the receipt's own sections
 * say why.
 */
export function ReceiptActions({
  instanceSlug,
  models,
  view,
}: ReceiptActionsProps) {
  const { t } = useTranslation();
  const access = useAiAccess();
  const [dialog, setDialog] = useState<'refund' | 'externalId' | null>(null);
  const link = receiptAction(view);
  const refundable =
    view.refund?.state === 'REFUNDABLE' && access.allows('refundAiInference');
  // A name the catalogue has learnt since needs no teaching.
  const nameable =
    view.denialReason === 'UNKNOWN_MODEL' &&
    !view.knownSince &&
    access.allows('updateModel');
  if (!link && !refundable && !nameable) {
    return null;
  }

  return (
    <>
      {refundable && view.refund ? (
        <Button variant="outline" onClick={() => setDialog('refund')}>
          {t('AI.Receipt.refund.action', {
            amount: formatCredits(view.refund.refundable),
          })}
        </Button>
      ) : null}
      {nameable ? (
        <Button onClick={() => setDialog('externalId')}>
          {t('AI.Receipt.externalId.action')}
        </Button>
      ) : null}
      {link ? <ActionLink action={link} /> : null}
      {dialog === 'refund' && view.refund ? (
        <RefundDialog
          instanceSlug={instanceSlug}
          pool={view.pool}
          transactionId={view.inference.transactionId}
          refund={view.refund}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'externalId' ? (
        <AddExternalIdDialog
          sent={view.inference.model}
          models={models}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
