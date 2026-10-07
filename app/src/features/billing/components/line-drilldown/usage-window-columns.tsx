import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { UsageReport } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { formatInstant, rightAlignedHeader } from '@/domains/billing';
import { type ColumnDef, TableJsonDialog } from '@/functionals/table';
import { formatDecimalQuantity } from '@/lib/decimal';

// One word for each way a report moves the counter: a way the API adds fails the
// type check until it has one, and the French screen never prints a wire word.
const BEHAVIOR_LABEL_KEYS = {
  append: 'Pages.Billing.Invoices.Drilldown.Behavior.append',
  set: 'Pages.Billing.Invoices.Drilldown.Behavior.set',
} as const satisfies Record<UsageReport['behavior'], string>;

const right = 'text-right tabular-nums';

function BehaviorCell({ behavior }: { behavior: UsageReport['behavior'] }) {
  const { t } = useTranslation();
  const labelKey = BEHAVIOR_LABEL_KEYS[behavior];

  return (
    <span className="text-xs text-muted-foreground">
      {/* A way the console does not know is shown as the API named it. */}
      {labelKey ? t(labelKey) : behavior}
    </span>
  );
}

type LimitCellProps = {
  isChange: boolean;
  limit: UsageReport['limitValue'];
};

function LimitCell({ isChange, limit }: LimitCellProps) {
  const { i18n, t } = useTranslation();

  return (
    <div className="flex items-center gap-2 tabular-nums">
      {typeof limit === 'string'
        ? formatDecimalQuantity(limit, i18n.language)
        : t('Pages.Billing.Invoices.Drilldown.unlimited')}
      {isChange ? (
        <Badge className="font-normal" variant="outline">
          {t('Pages.Billing.Invoices.Drilldown.limitChanged')}
        </Badge>
      ) : null}
    </div>
  );
}

function PropertiesCell({ report }: { report: UsageReport }) {
  const { t } = useTranslation();

  return (
    <TableJsonDialog
      emptyMessage="—"
      title={t('Pages.Billing.Invoices.Drilldown.propertiesTitle', {
        report: report.reportSeq,
      })}
      triggerAriaLabel={t('Pages.Billing.Invoices.Drilldown.propertiesOpen', {
        report: report.reportSeq,
      })}
      value={report.properties}
    />
  );
}

/**
 * The columns of the usage reports of a window, in the order they were accepted:
 * the report and when it came, how it moved the counter and from what to what,
 * the change and the overage it made, the limit in force (marked on the report
 * where it moved) and the transaction and properties the instance sent.
 */
export function useUsageWindowColumns(
  limitChanges: ReadonlySet<number>,
): ColumnDef<UsageReport>[] {
  const { i18n, t } = useTranslation();
  const language = i18n.language;

  return useMemo<ColumnDef<UsageReport>[]>(
    () => [
      {
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.reportSeq}</span>
        ),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Drilldown.Columns.report'),
        id: 'report',
      },
      {
        cell: ({ row }) => (
          <span className="text-xs">
            {formatInstant(row.original.reportedAt, language)}
          </span>
        ),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Drilldown.Columns.reportedAt'),
        id: 'reportedAt',
      },
      {
        cell: ({ row }) => <BehaviorCell behavior={row.original.behavior} />,
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Drilldown.Columns.behavior'),
        id: 'behavior',
      },
      {
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDecimalQuantity(row.original.valueBefore, language)}
            {' → '}
            {formatDecimalQuantity(row.original.valueAfter, language)}
          </span>
        ),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Drilldown.Columns.counter'),
        id: 'counter',
      },
      {
        cell: ({ row }) => (
          <div className={right}>
            {formatDecimalQuantity(row.original.delta, language)}
          </div>
        ),
        enableSorting: false,
        header: rightAlignedHeader(
          t('Pages.Billing.Invoices.Drilldown.Columns.delta'),
        ),
        id: 'delta',
      },
      {
        cell: ({ row }) => (
          <div className={right}>
            {formatDecimalQuantity(row.original.overageDelta, language)}
          </div>
        ),
        enableSorting: false,
        header: rightAlignedHeader(
          t('Pages.Billing.Invoices.Drilldown.Columns.overageDelta'),
        ),
        id: 'overageDelta',
      },
      {
        cell: ({ row }) => (
          <LimitCell
            isChange={limitChanges.has(row.original.reportSeq)}
            limit={row.original.limitValue}
          />
        ),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Drilldown.Columns.limit'),
        id: 'limit',
      },
      {
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.transactionId ?? '—'}
          </span>
        ),
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Drilldown.Columns.transaction'),
        id: 'transaction',
      },
      {
        cell: ({ row }) => <PropertiesCell report={row.original} />,
        enableSorting: false,
        header: t('Pages.Billing.Invoices.Drilldown.Columns.properties'),
        id: 'properties',
      },
    ],
    [language, limitChanges, t],
  );
}
