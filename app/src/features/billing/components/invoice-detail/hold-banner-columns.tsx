import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { HeldPair, Invoice } from '@/api-client';
import { getHoldReasonLabelKey, isKnownHoldReason } from '@/domains/billing';
import type { ColumnDef } from '@/functionals/table';

/** The check that failed, in words; one the console does not know is shown as the API named it. */
export const getCheckLabel = (invariant: string, t: TFunction) =>
  isKnownHoldReason(invariant)
    ? t(getHoldReasonLabelKey(invariant))
    : invariant;

/** The meters of the lines, by id: a pair names its entitlement by id, and a line carries the slug. */
function entitlementSlugs(invoice: Invoice): Map<string, string> {
  const slugs = new Map<string, string>();

  for (const line of invoice.lines) {
    if (line.entitlementId && line.entitlementSlug) {
      slugs.set(line.entitlementId, line.entitlementSlug);
    }
  }

  return slugs;
}

function reportsOf(pair: HeldPair): string | null {
  if (pair.firstSeq === null || pair.lastSeq === null) {
    return null;
  }

  return `${pair.firstSeq}–${pair.lastSeq}`;
}

const numeric = 'tabular-nums';

/**
 * The columns of the meters that failed their check: which meter, which check, the
 * figure expected and the one found, the reports the check covered and the number
 * of the report the counter stands at.
 */
export function useHeldPairColumns(invoice: Invoice): ColumnDef<HeldPair>[] {
  const { t } = useTranslation();

  return useMemo<ColumnDef<HeldPair>[]>(() => {
    const slugs = entitlementSlugs(invoice);

    return [
      {
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {slugs.get(row.original.entitlementId) ??
              row.original.entitlementId}
          </span>
        ),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Detail.Hold.Columns.meter'),
        id: 'meter',
      },
      {
        cell: ({ row }) => getCheckLabel(row.original.invariant, t),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Detail.Hold.Columns.check'),
        id: 'check',
      },
      {
        cell: ({ row }) => (
          <span className={numeric}>{row.original.expected}</span>
        ),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Detail.Hold.Columns.expected'),
        id: 'expected',
      },
      {
        cell: ({ row }) => (
          <span className={numeric}>{row.original.found}</span>
        ),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Detail.Hold.Columns.found'),
        id: 'found',
      },
      {
        cell: ({ row }) => (
          <span className={numeric}>{reportsOf(row.original) ?? '—'}</span>
        ),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Detail.Hold.Columns.reports'),
        id: 'reports',
      },
      {
        cell: ({ row }) => (
          <span className={numeric}>
            {row.original.counterReportSeq ?? '—'}
          </span>
        ),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Detail.Hold.Columns.counter'),
        id: 'counter',
      },
    ];
  }, [invoice, t]);
}
