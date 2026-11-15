import { useTranslation } from 'react-i18next';
import type { AiInferenceRefund } from '@/api-client';
import { formatDateTime } from '@/lib/format-date';
import { formatCredits } from '../format';
import { ReceiptSection } from './receipt-parts';
import type { ReceiptView } from './receipt-view';

const UTC_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'UTC',
};

/**
 * The refunds of a charge, oldest first: how much, why, who, when, and where
 * the refund sits in the usage journal. The charge itself is never rewritten;
 * the summary says how much of it has been given back.
 */
export function ReceiptRefunds({ view }: { view: ReceiptView }) {
  const { t } = useTranslation();
  const { refund } = view;
  if (!refund || refund.refunds.length === 0) {
    return null;
  }

  function renderRefund(item: AiInferenceRefund) {
    return (
      <li key={item.id} className="rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium tabular-nums">
            {t('AI.Receipt.refunds.amount', {
              amount: formatCredits(item.credits),
            })}
          </span>
          <time
            className="text-xs tabular-nums text-muted-foreground"
            dateTime={item.createdAt}
          >
            {formatDateTime(item.createdAt, UTC_TIME)} UTC
          </time>
        </div>
        <p className="mt-1 break-words">
          {item.reason ?? (
            <span className="text-muted-foreground">
              {t('AI.Receipt.refunds.noReason')}
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('AI.Receipt.refunds.by', {
            name: item.createdBy.name ?? t('AI.Receipt.refunds.unknownUser'),
          })}
          {' · '}
          {t('AI.Receipt.refunds.sequence', { sequence: item.reportSeq })}
        </p>
      </li>
    );
  }

  return (
    <ReceiptSection title={t('AI.Receipt.sections.refunds')}>
      <p className="text-sm">
        {t('AI.Receipt.refunds.summary', {
          refunded: formatCredits(refund.refunded),
          charged: formatCredits(refund.charged),
        })}{' '}
        <span className="text-muted-foreground">
          {refund.state === 'NOTHING_LEFT'
            ? t('AI.Receipt.refunds.nothingLeft')
            : t('AI.Receipt.refunds.left', {
                amount: formatCredits(refund.refundable),
              })}
        </span>
      </p>
      <ul className="space-y-2">{refund.refunds.map(renderRefund)}</ul>
    </ReceiptSection>
  );
}
