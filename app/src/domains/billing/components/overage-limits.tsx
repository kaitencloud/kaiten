import { useTranslation } from 'react-i18next';
import type { InvoiceLineOverage, OverageLimit } from '@/api-client';
import { formatDecimalQuantity } from '@/lib/decimal';
import { cn } from '@/lib/utils';

type OverageLimitsProps = {
  className?: string;
  /** The `overage` member of an OVERAGE line. */
  overage: InvoiceLineOverage;
};

function LimitItem({ limit }: { limit: OverageLimit }) {
  const { i18n, t } = useTranslation();
  const { rows } = limit;

  return (
    <li className="tabular-nums">
      {limit.limitValue === null
        ? t('Features.Billing.Overage.unlimited')
        : t('Features.Billing.Overage.limit', {
            limit: formatDecimalQuantity(limit.limitValue, i18n.language),
            percent: limit.overagePercent,
          })}
      {/* A sample has no reports to count. */}
      {rows > 0
        ? ` · ${t('Features.Billing.Overage.reports', { count: rows })}`
        : null}
    </li>
  );
}

// A limit is told apart by what it says: the same limit twice in a period would be
// one entry, since the API lists the limits in the order they first applied.
function renderLimit(limit: OverageLimit) {
  const key = `${limit.limitValue}:${limit.overagePercent}:${limit.rows}`;

  return <LimitItem key={key} limit={limit} />;
}

/**
 * The arithmetic behind an overage line: what was measured, how much of it was
 * above the limit, and the limits that applied, in the order they first applied.
 * A limit that changed during the period (an add-on, a boost) shows as more than
 * one, which is why the overage is not simply the usage minus today's limit. The
 * figures are the API's, written as they came.
 */
export function OverageLimits({ className, overage }: OverageLimitsProps) {
  const { i18n, t } = useTranslation();

  return (
    <div
      className={cn('space-y-0.5 text-xs text-muted-foreground', className)}
      data-testid="overage-limits"
    >
      <p className="tabular-nums">
        {t('Features.Billing.Overage.measured', {
          overage: formatDecimalQuantity(
            overage.overageMeasured,
            i18n.language,
          ),
          usage: formatDecimalQuantity(overage.usageMeasured, i18n.language),
        })}
      </p>
      <ul aria-label={t('Features.Billing.Overage.limitsLabel')}>
        {overage.limits.map(renderLimit)}
      </ul>
    </div>
  );
}
