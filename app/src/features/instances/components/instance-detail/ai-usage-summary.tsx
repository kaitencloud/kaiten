import { useTranslation } from 'react-i18next';
import type { EntitlementUsage } from '@/api-client';
import { formatDate, formatNumber } from '@/lib/format-date';

export function formatCredits(value?: string | number | null) {
  if (value == null) {
    return '—';
  }

  const credits = Number(value);
  return formatNumber(credits === 0 ? 0 : credits, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function creditBalance(usage: EntitlementUsage) {
  const consumed = usage.value.type === 'number' ? usage.value.value : 0;
  const reserved = Number(usage.reserved ?? 0);
  const allowance = usage.limit?.type === 'number' ? usage.limit.value : -1;
  const percent = usage.limitCapExceededOveragePercent ?? 0;
  const unlimited = allowance < 0 || percent < 0;
  const maximum = unlimited ? null : allowance * (1 + percent / 100);
  const available = maximum == null ? null : maximum - consumed - reserved;
  const consumedPercent =
    maximum && maximum > 0
      ? Math.min(100, Math.max(0, (consumed / maximum) * 100))
      : 0;
  const reservedPercent =
    maximum && maximum > 0
      ? Math.min(100 - consumedPercent, Math.max(0, (reserved / maximum) * 100))
      : 0;
  return {
    consumed,
    reserved,
    allowance,
    maximum,
    available,
    consumedPercent,
    reservedPercent,
  };
}

export function AiUsageSummary({
  usage,
  name,
}: {
  usage: EntitlementUsage;
  name: string;
}) {
  const { t } = useTranslation();
  const balance = creditBalance(usage);
  const available =
    balance.available == null
      ? t('AI.Usage.unlimited')
      : formatCredits(balance.available);
  return (
    <div className="space-y-4 border-b border-border px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{name}</h3>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {usage.entitlementSlug}
          </p>
        </div>
        <p className="text-right text-xs leading-5 text-muted-foreground">
          <span className="block">{t('AI.Usage.window')}</span>
          {usage.currentPeriodStart
            ? `${formatDate(usage.currentPeriodStart, { dateStyle: 'medium', timeZone: 'UTC' })} — ${formatDate(usage.currentPeriodEnd, { dateStyle: 'medium', timeZone: 'UTC' })}`
            : t('AI.Usage.lifetime')}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
        <div>
          <dt className="text-sm text-muted-foreground">
            {t('AI.Usage.available')}
          </dt>
          <dd
            className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${balance.available != null && balance.available < 0 ? 'text-destructive-subtle-foreground' : ''}`}
          >
            {available}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {t('AI.Usage.consumed')}
          </dt>
          <dd className="mt-1 text-xl font-medium tabular-nums">
            {formatCredits(balance.consumed)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {t('AI.Usage.reserved')}
          </dt>
          <dd className="mt-1 text-xl font-medium tabular-nums">
            {formatCredits(balance.reserved)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {t('AI.Usage.maximum')}
          </dt>
          <dd className="mt-1 text-xl font-medium tabular-nums">
            {balance.maximum == null
              ? t('AI.Usage.unlimited')
              : formatCredits(balance.maximum)}
          </dd>
        </div>
      </dl>
      {balance.maximum != null && balance.maximum > 0 ? (
        <div>
          <div
            role="meter"
            aria-label={t('AI.Usage.meterLabel')}
            aria-valuemin={0}
            aria-valuemax={balance.maximum}
            aria-valuenow={Math.min(
              balance.maximum,
              Math.max(0, balance.consumed + balance.reserved),
            )}
            aria-valuetext={t('AI.Usage.meterValue', {
              consumed: formatCredits(balance.consumed),
              reserved: formatCredits(balance.reserved),
              maximum: formatCredits(balance.maximum),
            })}
            className="flex h-2 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="h-full bg-primary"
              style={{ width: `${balance.consumedPercent}%` }}
            />
            <span
              className="h-full bg-primary/30"
              style={{ width: `${balance.reservedPercent}%` }}
            />
          </div>
        </div>
      ) : null}
      <details className="text-xs leading-5 text-muted-foreground">
        <summary className="cursor-pointer rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('AI.Usage.allowanceDetails')}</summary>
        <div className="mt-2 space-y-1">
          {balance.allowance >= 0 ? <p>{t('AI.Usage.allowance', { limit: formatCredits(balance.allowance) })}</p> : null}
          <p>{t('AI.Usage.effectivePolicy')}</p>
        </div>
      </details>
    </div>
  );
}
