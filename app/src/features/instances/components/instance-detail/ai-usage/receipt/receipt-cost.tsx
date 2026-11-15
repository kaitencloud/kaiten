import { useTranslation } from 'react-i18next';
import { formatFraction, formatUsd } from '../format';
import { ReceiptList, ReceiptRow, ReceiptSection } from './receipt-parts';
import type { ReceiptView } from './receipt-view';

/**
 * What the call cost at the vendor: the cost computed from the catalogue (by
 * the API at commit when the row stores it, from today's catalogue for an
 * older row), the cost the integration reported, how far apart they are, and
 * what a credit of this charge cost.
 */
export function ReceiptCost({ view }: { view: ReceiptView }) {
  const { t } = useTranslation();
  const { cost } = view;
  if (!cost) {
    return null;
  }
  const charged = Number(view.inference.credits.charged ?? 0) > 0;
  const negative = cost.margin?.startsWith('-') ?? false;
  const stored = cost.computedSource === 'STORED';

  return (
    <ReceiptSection title={t('AI.Receipt.sections.cost')}>
      <ReceiptList>
        <ReceiptRow
          label={t(
            stored
              ? 'AI.Receipt.cost.vendorStored'
              : 'AI.Receipt.cost.vendorComputed',
          )}
          note={cost.partial ? t('AI.Receipt.cost.partial') : undefined}
        >
          {cost.computed
            ? formatUsd(cost.computed)
            : t('AI.Receipt.cost.unknown')}
        </ReceiptRow>
        <ReceiptRow label={t('AI.Receipt.cost.vendorReported')}>
          {cost.reported
            ? formatUsd(cost.reported)
            : t(
                stored
                  ? 'AI.Receipt.cost.notReported'
                  : 'AI.Receipt.cost.notStored',
              )}
        </ReceiptRow>
        {cost.drift ? (
          <ReceiptRow
            label={t('AI.Receipt.cost.drift')}
            note={t(
              cost.drift.startsWith('-')
                ? 'AI.Receipt.cost.driftBelow'
                : 'AI.Receipt.cost.driftAbove',
            )}
          >
            {cost.drift.startsWith('-') ? '−' : '+'}
            {formatUsd(cost.drift.replace(/^-/, ''))}
          </ReceiptRow>
        ) : null}
        <ReceiptRow
          label={t('AI.Receipt.cost.costPerCredit')}
          note={
            charged && cost.reported
              ? t('AI.Receipt.cost.costPerCreditNote')
              : undefined
          }
        >
          {!charged
            ? t('AI.Receipt.cost.notCharged')
            : cost.partial
              ? '—'
              : formatUsd(cost.costPerCredit)}
        </ReceiptRow>
        {cost.creditValue ? (
          <ReceiptRow
            label={t('AI.Receipt.cost.margin', {
              value: formatUsd(cost.creditValue),
            })}
            note={
              cost.marginAfterRefunds
                ? `${t('AI.Receipt.cost.marginAfterRefunds')} ${t('AI.Receipt.cost.marginNote')}`
                : t('AI.Receipt.cost.marginNote')
            }
          >
            <span
              className={
                negative ? 'text-destructive-subtle-foreground' : undefined
              }
            >
              {!charged
                ? t('AI.Receipt.cost.notCharged')
                : cost.partial
                  ? '—'
                  : view.refund?.state === 'NOTHING_LEFT'
                    ? t('AI.Receipt.cost.refundedInFull')
                    : formatFraction(cost.margin)}
            </span>
          </ReceiptRow>
        ) : null}
      </ReceiptList>
      {cost.creditValue ? null : (
        <p className="text-xs text-muted-foreground">
          {t('AI.Receipt.cost.noMargin')}
        </p>
      )}
    </ReceiptSection>
  );
}
