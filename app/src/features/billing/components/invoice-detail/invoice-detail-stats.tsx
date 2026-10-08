import type { TFunction } from 'i18next';
import { Banknote, CalendarClock, CalendarRange } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import {
  formatServicePeriod,
  formatUtcDate,
  formatUtcTime,
  getInvoiceKindLabelKey,
  Money,
  splitUtcMarker,
} from '@/domains/billing';
import { StatBadgeValue, StatCard } from '@/functionals/stat-card';
import { cn } from '@/lib/utils';
import {
  getInvoiceDue,
  type InvoiceDue,
  type InvoiceEnding,
} from '../../utils/invoice-due';

type InvoiceDetailStatsProps = {
  invoice: Invoice;
  /** The instant "overdue" is judged at; now when left out. */
  now?: number;
};

// The cards' lines share the row's tracks, as in the strip of an instance: a
// first line starts at the top of its track, level with its neighbours, whether
// or not a date wraps on a narrow screen, and each helper sits on one baseline.
const FIRST_LINE = 'self-start';
const SECOND_LINE = 'self-baseline-last';
const OVERDUE = 'text-destructive-subtle-foreground';

const ENDING_LABEL_KEYS = {
  paid: 'Pages.Billing.Invoices.Detail.Stats.paid',
  voided: 'Pages.Billing.Invoices.Detail.Stats.voided',
  'written-off': 'Pages.Billing.Invoices.Detail.Stats.writtenOff',
} as const satisfies Record<InvoiceEnding, string>;

const NOT_ISSUED_KEY = 'Features.Billing.Invoices.notIssued';

// The period is two dates and a zone where the other figures are one amount or
// one date: a size below theirs, as the two figures of the usage alerts of an
// instance, so that it keeps to one line where the card has the room, a month of
// it from the width of a laptop, and breaks after its dash where it has not.
const PERIOD_VALUE = 'text-xl md:text-2xl';

// A no-break space: the caption never starts a line of its own.
const NO_BREAK_SPACE = '\u00A0';

// What a period sets between its two dates: a dash, with the space the locale
// puts around it.
const PERIOD_DASH = /\s*–\s*/;

/** A piece of a value that is never split across two lines while it fits on one. */
const Piece = ({ children }: { children: ReactNode }) => (
  <span className="inline-block">{children}</span>
);

/**
 * A UTC date or period of the strip, in the numeral type like the figures beside
 * it, with the zone it is in set after it as a caption, which stays with the last
 * date. A period too long for the card wraps after its dash, each date whole, and
 * only a date too long for the card by itself breaks inside.
 */
function UtcValue({ text }: { text: string }) {
  const { marker, text: bare } = splitUtcMarker(text);
  const dates = bare.split(PERIOD_DASH);
  const caption = marker ? (
    <>
      {NO_BREAK_SPACE}
      <StatCard.Unit>{marker}</StatCard.Unit>
    </>
  ) : null;

  if (dates.length !== 2) {
    return (
      <span>
        {bare}
        {caption}
      </span>
    );
  }

  return (
    <span>
      <Piece>{`${dates[0]} –`}</Piece>{' '}
      <Piece>
        {dates[1]}
        {caption}
      </Piece>
    </span>
  );
}

const labelKeyOf = (due: InvoiceDue) =>
  due.kind === 'ended'
    ? ENDING_LABEL_KEYS[due.ending]
    : 'Pages.Billing.Invoices.Detail.Stats.due';

/** The words under a due date: how far away it is, or how long it has been missed. */
function describeDays(
  due: Extract<InvoiceDue, { kind: 'due' }>,
  language: string,
  t: TFunction,
): string {
  if (due.overdue) {
    return due.days === 0
      ? t('Pages.Billing.Invoices.Detail.Stats.overdueToday')
      : t('Pages.Billing.Invoices.Detail.Stats.overdue', {
          count: -due.days,
        });
  }

  return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(
    due.days,
    'day',
  );
}

function getDueValue(
  due: InvoiceDue,
  language: string,
  t: TFunction,
): ReactNode {
  switch (due.kind) {
    case 'not-issued':
      return <StatBadgeValue>{t(NOT_ISSUED_KEY)}</StatBadgeValue>;
    case 'no-due-date':
      return (
        <StatBadgeValue>
          {t('Pages.Billing.Invoices.Detail.Stats.noDueDate')}
        </StatBadgeValue>
      );
    case 'due':
      return <UtcValue text={formatUtcDate(due.dueAt, language)} />;
    case 'ended':
      return <UtcValue text={formatUtcDate(due.at, language)} />;
  }
}

function getDueHelper(
  due: InvoiceDue,
  language: string,
  t: TFunction,
): string | null {
  if (due.kind === 'due') {
    return describeDays(due, language, t);
  }

  // The time of day the invoice ended at, which the day above leaves out.
  return due.kind === 'ended' && due.at
    ? formatUtcTime(due.at, language)
    : null;
}

/** What the invoice comes to, as the API states it. The lines are counted, never added up. */
function TotalStat({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation();

  return (
    <StatCard>
      <StatCard.Label>
        {t('Pages.Billing.Invoices.Detail.Stats.total')}
      </StatCard.Label>
      <StatCard.Icon>
        <Banknote />
      </StatCard.Icon>
      <StatCard.Value className={FIRST_LINE}>
        <Money amount={invoice.total} currency={invoice.currency} />
      </StatCard.Value>
      <StatCard.Helper className={SECOND_LINE}>
        {t('Pages.Billing.Invoices.Detail.Stats.totalLines', {
          count: invoice.lines.length,
        })}
      </StatCard.Helper>
    </StatCard>
  );
}

/**
 * When the invoice is to be paid, and how that stands. An invoice nobody issued
 * has no due date and says so, and one that ended is no longer due: the card then
 * says when it ended, since the state itself is the badge of the title, and the
 * summary keeps the day it had fallen due.
 */
function DueStat({ invoice, now }: InvoiceDetailStatsProps) {
  const { i18n, t } = useTranslation();
  const due = getInvoiceDue(invoice, now);
  const helper = getDueHelper(due, i18n.language, t);
  const isOverdue = due.kind === 'due' && due.overdue;

  return (
    <StatCard>
      <StatCard.Label>{t(labelKeyOf(due))}</StatCard.Label>
      <StatCard.Icon>
        <CalendarClock />
      </StatCard.Icon>
      <StatCard.Value className={cn(FIRST_LINE, isOverdue && OVERDUE)}>
        {getDueValue(due, i18n.language, t)}
      </StatCard.Value>
      {helper ? (
        <StatCard.Helper className={cn(SECOND_LINE, isOverdue && OVERDUE)}>
          {helper}
        </StatCard.Helper>
      ) : null}
    </StatCard>
  );
}

/** The span the lines of the invoice bill, in UTC, and which kind of invoice it is. */
function ServicePeriodStat({ invoice }: { invoice: Invoice }) {
  const { i18n, t } = useTranslation();

  return (
    // Both columns of the strip below `lg`: a period is too long for half of one.
    <StatCard className="col-span-2 lg:col-span-1">
      <StatCard.Label>
        {t('Pages.Billing.Invoices.Detail.Stats.period')}
      </StatCard.Label>
      <StatCard.Icon>
        <CalendarRange />
      </StatCard.Icon>
      <StatCard.Value className={cn(FIRST_LINE, PERIOD_VALUE)}>
        <UtcValue
          text={formatServicePeriod(
            invoice.serviceFrom,
            invoice.serviceTo,
            i18n.language,
          )}
        />
      </StatCard.Value>
      <StatCard.Helper className={SECOND_LINE}>
        {t(getInvoiceKindLabelKey(invoice.kind))}
      </StatCard.Helper>
    </StatCard>
  );
}

/**
 * The three figures under the header of an invoice, as an instance has its own:
 * what it comes to, when it is due and the period it bills. Each has one home,
 * here and not in the cards below, apart from the total, which the lines card
 * also states under its amounts, and the due day of an invoice that ended, which
 * its summary states in place of this card.
 */
export function InvoiceDetailStats({ invoice, now }: InvoiceDetailStatsProps) {
  return (
    // Two columns up to `lg`, with the period under them: dates with their zone
    // are wider than the figures of an instance, and a third of a tablet cuts
    // them in two.
    <StatCard.Row columnsClassName="lg:grid-cols-3">
      <TotalStat invoice={invoice} />
      <DueStat invoice={invoice} now={now} />
      <ServicePeriodStat invoice={invoice} />
    </StatCard.Row>
  );
}
