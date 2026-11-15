import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type {
  PriceLine,
  PriceOutcome,
  PricingDimension,
  VendorCostResult,
} from '../engine';
import { formatCredits, formatRate, formatUsd } from '../pricing-format';
import { MarginValue } from '../rate-card-cell';

const DIMENSION_KEYS = {
  REQUEST: 'AI.Panel.breakdown.dimensions.REQUEST',
  INPUT_TOKEN: 'AI.Panel.breakdown.dimensions.INPUT_TOKEN',
  CACHE_READ_TOKEN: 'AI.Panel.breakdown.dimensions.CACHE_READ_TOKEN',
  CACHE_WRITE_TOKEN: 'AI.Panel.breakdown.dimensions.CACHE_WRITE_TOKEN',
  OUTPUT_TOKEN: 'AI.Panel.breakdown.dimensions.OUTPUT_TOKEN',
  UNIT: 'AI.Panel.breakdown.dimensions.UNIT',
  SECOND: 'AI.Panel.breakdown.dimensions.SECOND',
} as const satisfies Record<PricingDimension, string>;

function Row({
  label,
  strong = false,
  value,
  mono = false,
}: {
  label: ReactNode;
  mono?: boolean;
  strong?: boolean;
  value: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3',
        strong && 'font-semibold',
        mono && 'font-mono text-xs',
      )}
    >
      <dt className="min-w-0">{label}</dt>
      <dd className="shrink-0 text-right tabular-nums">{value}</dd>
    </div>
  );
}

type BreakdownProps = {
  cost: VendorCostResult | null;
  costPerCredit: string | null;
  /** The value of a credit the margin was computed with, when one is set. */
  creditValue: string | null;
  margin: string | null;
  price: PriceOutcome | null;
};

/**
 * How the reference call comes to its price: each rate times its quantity, the
 * sum, the bound that moved it, and what the call costs at the vendor.
 */
export function ReferenceCallBreakdown({
  cost,
  costPerCredit,
  creditValue,
  margin,
  price,
}: BreakdownProps) {
  const { t } = useTranslation();
  // The catalogue costs part of the call only: the total is a floor, and no
  // cost per credit or margin is derived from it.
  const partial = cost !== null && cost.known && !cost.complete;

  function renderLine(line: PriceLine) {
    const dimension = t(DIMENSION_KEYS[line.dimension]);
    const label =
      line.dimension === 'REQUEST'
        ? dimension
        : `${formatRate(line.quantity)} ${dimension} × ${formatRate(line.rate)}`;

    return (
      <Row
        key={line.dimension}
        label={
          line.rateSource === 'INPUT_FALLBACK'
            ? `${label} ${t('AI.Panel.breakdown.inputRate')}`
            : label
        }
        mono
        value={formatCredits(line.credits)}
      />
    );
  }

  return (
    <>
      <dl className="flex flex-col gap-1 text-sm">
        {price?.ok ? (
          <>
            {price.lines.length === 0 ? (
              <Row
                label={t('AI.Panel.breakdown.noLine')}
                mono
                value={formatCredits('0')}
              />
            ) : (
              price.lines.map(renderLine)
            )}
            <Row
              label={t('AI.Panel.breakdown.computed')}
              strong
              value={formatCredits(price.computed)}
            />
            {price.clamp ? (
              <Row
                label={t(
                  price.clamp === 'MINIMUM'
                    ? 'AI.Panel.breakdown.raised'
                    : 'AI.Panel.breakdown.capped',
                )}
                value={formatCredits(price.charged)}
              />
            ) : null}
            <Row
              label={t('AI.Panel.breakdown.charged')}
              strong
              value={t('AI.Panel.breakdown.credits', {
                amount: formatCredits(price.charged),
              })}
            />
          </>
        ) : null}
        <Row
          label={t('AI.Panel.breakdown.vendorCost')}
          value={
            cost?.total == null
              ? t('AI.Panel.breakdown.unknown')
              : formatUsd(cost.total)
          }
        />
        <Row
          label={t('AI.Panel.breakdown.costPerCredit')}
          value={costPerCredit === null ? '—' : formatUsd(costPerCredit)}
        />
        <Row
          label={
            creditValue === null
              ? t('AI.Panel.breakdown.margin')
              : t('AI.Panel.breakdown.marginAt', {
                  value: formatUsd(creditValue),
                })
          }
          value={
            margin === null ? (
              <span className="text-muted-foreground">
                {creditValue === null && !partial
                  ? t('AI.Panel.breakdown.setValue')
                  : '—'}
              </span>
            ) : (
              <MarginValue margin={margin} />
            )
          }
        />
      </dl>
      {partial ? (
        <p className="text-xs text-muted-foreground">
          {t('AI.Panel.breakdown.partial')}
        </p>
      ) : null}
    </>
  );
}
