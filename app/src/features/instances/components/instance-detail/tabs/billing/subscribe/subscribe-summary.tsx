import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
import {
  formatBoundary,
  getFirstInvoiceTiming,
  getTrialEnd,
} from '@/domains/billing';
import { dateTimeInputToInstant } from '@/lib/date-time-input';

type SubscribeSummaryProps = {
  /** The base price chosen. */
  price: Price | undefined;
  /** The start typed, as the text of a datetime-local input; empty is now. */
  startAt: string;
  /** The days of trial the subscription starts with; none when it starts billing at once. */
  trialDays?: number;
};

/**
 * When the first invoice of the subscription is issued, which is the first thing
 * a person asks. It says when, and never how much: the console cannot compose an
 * invoice, and the API has no preview of the activation of a subscription it has
 * not started. An amount shown here would be one the console invented.
 */
export function SubscribeSummary({
  price,
  startAt,
  trialDays = 0,
}: SubscribeSummaryProps) {
  const { i18n, t } = useTranslation();

  if (!price?.billingPeriod) {
    return null;
  }
  const start = dateTimeInputToInstant(startAt);
  // A trial is never invoiced: the first invoice is issued when it ends. A price
  // that bills in arrears has no trial, and the form says none is asked for.
  const trial =
    trialDays > 0 && price.billingTiming === 'ADVANCE'
      ? getTrialEnd({ startAt: start ? new Date(start) : undefined, trialDays })
      : null;
  const timing = getFirstInvoiceTiming({
    billingPeriod: price.billingPeriod,
    billingTiming: price.billingTiming,
    startAt: start ? new Date(start) : undefined,
  });

  return (
    <div
      className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm"
      data-testid="subscribe-summary"
    >
      <CalendarClock
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <p aria-live="polite">
        {trial
          ? t(
              'Pages.Customers.Instances.Detail.Billing.Subscribe.Summary.trial',
              {
                date: formatBoundary(trial.toISOString(), i18n.language),
              },
            )
          : timing.kind === 'now'
            ? t(
                'Pages.Customers.Instances.Detail.Billing.Subscribe.Summary.now',
              )
            : t(
                timing.alreadyDue
                  ? 'Pages.Customers.Instances.Detail.Billing.Subscribe.Summary.arrearsDue'
                  : 'Pages.Customers.Instances.Detail.Billing.Subscribe.Summary.arrears',
                {
                  date: formatBoundary(timing.at.toISOString(), i18n.language),
                },
              )}
      </p>
    </div>
  );
}
