import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StateBadge, WarningBadge } from '../inference-cells';
import { ReceiptPricing } from './receipt-pricing';
import { ReceiptRefunds } from './receipt-refunds';
import { ReceiptCost } from './receipt-cost';
import { ReceiptCall, ReceiptEffect, ReceiptOutcome } from './receipt-sections';
import type { ReceiptView } from './receipt-view';
import { ReceiptWarnings } from './receipt-warnings';

/** The badges under the receipt's title: state, then what qualifies it. */
export function ReceiptHeadline({ view }: { view: ReceiptView }) {
  const { t } = useTranslation();
  const { inference } = view;
  const type = t(`AI.Usage.requestTypes.${inference.requestType}`);
  const qualifier =
    view.kind === 'UNAUTHORIZED'
      ? t('AI.Receipt.headline.notAuthorized', {
          reason: inference.denialReason
            ? t(
                `AI.Usage.denials.${inference.denialReason}`,
                inference.denialReason,
              )
            : '—',
        })
      : view.kind === 'EXPIRED'
        ? t('AI.Receipt.headline.noCommit', { type })
        : view.kind === 'OPEN'
          ? t('AI.Receipt.headline.open', { type })
          : t('AI.Receipt.headline.outcome', {
              type,
              outcome: inference.requestStatus
                ? t(
                    `AI.Usage.outcomes.${inference.requestStatus}`,
                    inference.requestStatus,
                  )
                : '—',
            });

  return (
    <div className="flex flex-wrap gap-1.5">
      <StateBadge status={inference.status} />
      {view.kind === 'UNAUTHORIZED' ? (
        <WarningBadge>{qualifier}</WarningBadge>
      ) : (
        <span className="rounded-md border px-2 py-0.5 text-xs font-medium">
          {qualifier}
        </span>
      )}
      {view.model?.status === 'DEPRECATED' ? (
        <WarningBadge>{t('AI.Usage.badges.deprecated')}</WarningBadge>
      ) : null}
      {view.editedSince ? (
        <WarningBadge>{t('AI.Receipt.priced.editedSince')}</WarningBadge>
      ) : null}
      {view.ruleToday === 'ARCHIVED' ? (
        <WarningBadge>{t('AI.Receipt.priced.archivedSince')}</WarningBadge>
      ) : null}
    </div>
  );
}

/**
 * The row as the API returns it, for support. Closed by default, and not
 * rendered at all until opened: the receipt is the explanation, not the JSON.
 */
export function RawRecord({ view }: { view: ReceiptView }) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2 border-t pt-3">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'size-4 transition-transform motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
        {t('AI.Receipt.raw.show')}
      </Button>
      {open ? (
        <div id={id} className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {t('AI.Receipt.raw.description')}
          </p>
          <pre className="whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs leading-5">
            {JSON.stringify(view.inference, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

/** The receipt's content, from a view built by `buildReceiptView`. */
export function ReceiptBody({
  view,
  licenceName,
}: {
  view: ReceiptView;
  /** The name of the row's licence version, when the session could read it. */
  licenceName?: string | null;
}) {
  return (
    <div className="space-y-5">
      <ReceiptCall view={view} licenceName={licenceName} />
      <ReceiptWarnings warnings={view.warnings} />
      <ReceiptOutcome view={view} />
      <ReceiptPricing view={view} />
      <ReceiptRefunds view={view} />
      <ReceiptEffect view={view} />
      <ReceiptCost view={view} />
      <RawRecord view={view} />
    </div>
  );
}
