import { Info, TriangleAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntitlementUsage } from '@/api-client';
import { formatDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { formatCredits, formatFraction, formatWholeCredits } from './format';
import { creditBalance, type PoolBalance } from './pool-balance';
import { type Crossing, projectPool } from './projection';

type AiPoolHeaderProps = {
  name: string;
  usage: EntitlementUsage;
  /** The entitlement's early-warning threshold, in percent of the included credits. */
  warningThresholdPercent?: number | null;
  /** Open holds, when the reservations are read. */
  holds?: number;
  /** The clock the projection is measured at (a story or a test fixes it). */
  now?: number;
};

// The month in full: an abbreviated one ends with a period in some languages
// ("13 nov."), which doubles the one that ends the sentence.
const SHORT_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
};

function Metric({
  label,
  value,
  hint,
  emphasis = false,
  tone,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  emphasis?: boolean;
  tone?: 'destructive';
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-1 tabular-nums tracking-tight',
          emphasis ? 'text-3xl font-semibold' : 'text-xl font-medium',
          tone === 'destructive' && 'text-destructive-subtle-foreground',
        )}
      >
        {value}
      </dd>
      {hint ? (
        <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>
      ) : null}
    </div>
  );
}

function PoolMeter({ balance }: { balance: PoolBalance }) {
  const { t } = useTranslation();
  if (balance.maximum == null || balance.maximum <= 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div
        role="meter"
        aria-label={t('AI.Usage.meterLabel')}
        aria-valuemin={0}
        aria-valuemax={balance.maximum}
        aria-valuenow={Math.min(balance.maximum, Math.max(0, balance.used))}
        aria-valuetext={t('AI.Usage.meterValue', {
          consumed: formatCredits(balance.consumed),
          reserved: formatCredits(balance.reserved),
          maximum: formatWholeCredits(balance.maximum),
        })}
        className="relative h-2.5 rounded-full bg-muted"
      >
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-l-full',
            balance.state === 'OVERDRAWN' ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${balance.consumedPercent}%` }}
        />
        <span
          className="absolute inset-y-0 bg-primary/35"
          style={{
            left: `${balance.consumedPercent}%`,
            width: `${balance.reservedPercent}%`,
          }}
        />
        {balance.limitPercent != null ? (
          <span
            aria-hidden="true"
            className="absolute -inset-y-1 w-0.5 bg-foreground"
            style={{ left: `${balance.limitPercent}%` }}
          />
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-primary" />
          {t('AI.Usage.legend.consumed')}
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm bg-primary/35"
          />
          {t('AI.Usage.legend.reserved')}
        </li>
        {balance.limitPercent != null ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-0.5 bg-foreground" />
            {t('AI.Usage.legend.limit', {
              limit: formatWholeCredits(balance.allowance),
            })}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function crossingText(
  t: ReturnType<typeof useTranslation>['t'],
  key: 'included' | 'maximum',
  crossing: Crossing,
  resetsAt: string,
) {
  const date =
    crossing.kind === 'ON'
      ? formatDate(crossing.at, SHORT_DATE)
      : formatDate(resetsAt, SHORT_DATE);

  return t(`AI.Usage.projection.${key}.${crossing.kind}`, { date });
}

function PoolNotices({
  balance,
  usage,
  now,
  warningThresholdPercent,
}: {
  balance: PoolBalance;
  usage: EntitlementUsage;
  now: number;
  warningThresholdPercent?: number | null;
}) {
  const { t } = useTranslation();
  const projection = projectPool({
    consumed: balance.consumed,
    reserved: balance.reserved,
    limit: balance.allowance,
    maximum: balance.maximum,
    windowStart: usage.currentPeriodStart,
    windowEnd: usage.currentPeriodEnd,
    now,
  });
  const sentences = projection
    ? [
        t('AI.Usage.projection.pace', {
          perDay: formatWholeCredits(projection.perDay),
        }),
        crossingText(t, 'included', projection.included, projection.resetsAt),
        projection.maximum && projection.included.kind !== 'AFTER_RESET'
          ? crossingText(t, 'maximum', projection.maximum, projection.resetsAt)
          : null,
      ].filter(Boolean)
    : [];
  const state =
    balance.state === 'OVERDRAWN' ||
    balance.state === 'IN_OVERAGE' ||
    balance.state === 'NEAR_LIMIT'
      ? balance.state
      : null;

  return (
    <>
      {state ? (
        <p
          role={state === 'OVERDRAWN' ? 'alert' : undefined}
          className={cn(
            'flex gap-2 rounded-lg p-3 text-sm',
            state === 'OVERDRAWN'
              ? 'bg-destructive-subtle text-destructive-subtle-foreground'
              : 'bg-warning-subtle text-warning-subtle-foreground',
          )}
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            {t(`AI.Usage.state.${state}`, {
              amount: formatCredits(balance.overdrawnBy),
              boundary: formatWholeCredits(balance.warningBoundary ?? 0),
              percent: warningThresholdPercent ?? 0,
            })}
          </span>
        </p>
      ) : null}
      {sentences.length ? (
        <p className="flex gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{sentences.join(' ')}</span>
        </p>
      ) : null}
    </>
  );
}

/**
 * The state of one AI credit pool on an instance: what is left to reserve,
 * what was consumed and is held, against the included credits and the maximum
 * with overage, and the pace of the window. Every figure comes from the usage
 * read; the projection is a straight line, labelled as such.
 */
export function AiPoolHeader({
  name,
  usage,
  warningThresholdPercent,
  holds,
  now: nowProp,
}: AiPoolHeaderProps) {
  const { t } = useTranslation();
  // Read once per mount: the projection does not move while the page is open.
  const [clock] = useState(() => Date.now());
  const now = nowProp ?? clock;
  const balance = creditBalance(usage, warningThresholdPercent);
  const unlimited = balance.maximum == null;

  return (
    <div className="space-y-4 border-b px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{name}</h3>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {usage.entitlementSlug}
          </p>
        </div>
        <p className="text-right text-xs leading-5 text-muted-foreground">
          <span className="block">{t('AI.Usage.window')}</span>
          <span className="tabular-nums">
            {usage.currentPeriodStart
              ? `${formatDate(usage.currentPeriodStart, { dateStyle: 'medium', timeZone: 'UTC' })} — ${formatDate(usage.currentPeriodEnd, { dateStyle: 'medium', timeZone: 'UTC' })}`
              : t('AI.Usage.lifetime')}
          </span>
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 xl:grid-cols-5">
        <Metric
          emphasis
          label={t('AI.Usage.available')}
          value={
            unlimited
              ? t('AI.Usage.unlimited')
              : formatCredits(balance.available)
          }
          hint={unlimited ? undefined : t('AI.Usage.availableHint')}
          tone={balance.state === 'OVERDRAWN' ? 'destructive' : undefined}
        />
        <Metric
          label={t('AI.Usage.consumed')}
          value={formatCredits(balance.consumed)}
          hint={
            balance.consumedOfIncluded == null
              ? undefined
              : t('AI.Usage.consumedOfIncluded', {
                  percent: formatFraction(balance.consumedOfIncluded),
                })
          }
        />
        <Metric
          label={t('AI.Usage.reserved')}
          value={formatCredits(balance.reserved)}
          hint={
            holds == null
              ? undefined
              : t('AI.Usage.openHolds', { count: holds })
          }
        />
        <Metric
          label={t('AI.Usage.included')}
          value={
            balance.allowance < 0
              ? t('AI.Usage.unlimited')
              : formatWholeCredits(balance.allowance)
          }
          hint={t('AI.Usage.includedFrom', { licence: usage.licenseSlug })}
        />
        <Metric
          label={t('AI.Usage.maximum')}
          value={
            unlimited
              ? t('AI.Usage.unlimited')
              : formatWholeCredits(balance.maximum ?? 0)
          }
          hint={
            unlimited
              ? undefined
              : balance.overagePercent
                ? t('AI.Usage.overage', { percent: balance.overagePercent })
                : t('AI.Usage.hardLimit')
          }
        />
      </dl>
      <PoolMeter balance={balance} />
      <PoolNotices
        balance={balance}
        usage={usage}
        now={now}
        warningThresholdPercent={warningThresholdPercent}
      />
    </div>
  );
}
