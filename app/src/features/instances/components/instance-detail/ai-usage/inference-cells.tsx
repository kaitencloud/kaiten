import { useTranslation } from 'react-i18next';
import type { AiInference, Model } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { findModelByRef } from './engine';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { formatCredits } from './format';

/** The catalogue model a row names, as the server resolved it. */
export function rowModel(
  models: readonly Model[] | undefined,
  row: AiInference,
): Model | null {
  return models ? findModelByRef(models, row.modelSlug ?? row.model) : null;
}

const BADGE = 'border-0 font-medium';

export const STATE_CLASS: Record<AiInference['status'], string> = {
  COMMITTED: 'bg-success-subtle text-success-subtle-foreground',
  RESERVED: 'bg-primary-subtle text-primary-subtle-foreground',
  RELEASED: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-muted text-muted-foreground',
};

export function StateBadge({ status }: { status: AiInference['status'] }) {
  const { t } = useTranslation();

  return (
    <Badge variant="outline" className={cn(BADGE, STATE_CLASS[status])}>
      {t(`AI.Usage.states.${status}`)}
    </Badge>
  );
}

export function WarningBadge({ children }: { children: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(BADGE, 'bg-warning-subtle text-warning-subtle-foreground')}
    >
      {children}
    </Badge>
  );
}

/** The model as sent, and below it what the catalogue resolved it to. */
export function ModelCell({
  row,
  model,
}: {
  row: AiInference;
  model: Model | null;
}) {
  const { t } = useTranslation();
  const resolved = model
    ? t('AI.Usage.resolved', { name: model.name })
    : row.modelSlug
      ? t('AI.Usage.resolved', { name: row.modelSlug })
      : t('AI.Usage.notInCatalogue');

  return (
    <div className="min-w-40">
      <p className="break-all font-mono text-sm">{row.model}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {resolved} · {t(`AI.Usage.requestTypes.${row.requestType}`)}
      </p>
    </div>
  );
}

/** The state, the badges that qualify it, and the outcome or denial below. */
export function StatusCell({
  row,
  model,
}: {
  row: AiInference;
  model: Model | null;
}) {
  const { t } = useTranslation();
  const denied = row.authorized === false || Boolean(row.denialReason);
  const note = row.denialReason
    ? t(`AI.Usage.denials.${row.denialReason}`, row.denialReason)
    : row.status === 'EXPIRED'
      ? t('AI.Usage.noCommit')
      : row.requestStatus
        ? t(`AI.Usage.outcomes.${row.requestStatus}`, row.requestStatus)
        : null;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <StateBadge status={row.status} />
        {denied ? (
          <WarningBadge>{t('AI.Usage.badges.unauthorized')}</WarningBadge>
        ) : null}
        {model?.status === 'DEPRECATED' ? (
          <WarningBadge>{t('AI.Usage.badges.deprecated')}</WarningBadge>
        ) : null}
      </div>
      {note ? (
        <p
          className={cn(
            'text-xs',
            row.denialReason
              ? 'text-warning-subtle-foreground'
              : 'text-muted-foreground',
          )}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** Charged credits, with the computed amount below when they differ. */
export function ChargedCell({ row }: { row: AiInference }) {
  const { t } = useTranslation();
  // A hold charges nothing until it is committed; an expired one never does.
  const charged =
    row.status === 'RESERVED' ? null : (row.credits.charged ?? '0');
  const { computed } = row.credits;
  const differs =
    charged !== null &&
    computed != null &&
    Number(computed) !== Number(charged);

  return (
    <div className="whitespace-nowrap text-right">
      <p className="font-medium tabular-nums">{formatCredits(charged)}</p>
      {differs ? (
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {t('AI.Usage.computedAmount', { amount: formatCredits(computed) })}
        </p>
      ) : null}
    </div>
  );
}

export function TimeCell({ value }: { value?: string | null }) {
  return (
    <time
      className="whitespace-nowrap text-sm tabular-nums text-muted-foreground"
      dateTime={value ?? undefined}
    >
      {formatDateTime(value, {
        day: 'numeric',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: 'short',
        second: '2-digit',
        timeZone: 'UTC',
      })}
    </time>
  );
}
