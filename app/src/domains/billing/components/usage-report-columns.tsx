import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { UsageReport } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { type ColumnDef, TableJsonDialog } from '@/functionals/table';
import { formatDecimalQuantity } from '@/lib/decimal';
import { formatInstant } from '../logic/service-period';
import { rightAlignedHeader } from './table-headers';

// One word for each way a report moves the counter: a way the API adds fails the
// type check until it has one, and the French screen never prints a wire word.
const BEHAVIOR_LABEL_KEYS = {
  append: 'Features.Billing.UsageReports.Behavior.append',
  set: 'Features.Billing.UsageReports.Behavior.set',
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
        : t('Features.Billing.UsageReports.unlimited')}
      {isChange ? (
        <Badge className="font-normal" variant="outline">
          {t('Features.Billing.UsageReports.limitChanged')}
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
      title={t('Features.Billing.UsageReports.propertiesTitle', {
        report: report.reportSeq,
      })}
      triggerAriaLabel={t('Features.Billing.UsageReports.propertiesOpen', {
        report: report.reportSeq,
      })}
      value={report.properties}
    />
  );
}

type UsageReportColumnsOptions = {
  /** The numbers of the reports where the limit in force changed, which are marked. */
  limitChanges: ReadonlySet<number>;
  /** The overage a report made, for the screen that bills it. */
  showOverage?: boolean;
  /** The value as it was sent, for the screen that audits what an instance reported. */
  showValue?: boolean;
};

/**
 * The columns of a table of usage reports, in the order they were accepted: the
 * report and when it came, how it moved the counter and from what to what, the
 * change, the limit in force (marked on the report where it moved) and the
 * transaction and properties the instance sent. The screen that bills asks for
 * the overage a report made, the one that audits for the value as sent: they are
 * the same reports, read for two purposes.
 */
export function useUsageReportColumns({
  limitChanges,
  showOverage = false,
  showValue = false,
}: UsageReportColumnsOptions): ColumnDef<UsageReport>[] {
  const { i18n, t } = useTranslation();
  const language = i18n.language;

  return useMemo<ColumnDef<UsageReport>[]>(() => {
    const report: ColumnDef<UsageReport> = {
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.reportSeq}</span>
      ),
      enableSorting: false,
      header: t('Features.Billing.UsageReports.Columns.report'),
      id: 'report',
    };
    const reportedAt: ColumnDef<UsageReport> = {
      cell: ({ row }) => (
        <span className="text-xs">
          {formatInstant(row.original.reportedAt, language)}
        </span>
      ),
      enableSorting: false,
      header: t('Features.Billing.UsageReports.Columns.reportedAt'),
      id: 'reportedAt',
    };
    const behavior: ColumnDef<UsageReport> = {
      cell: ({ row }) => <BehaviorCell behavior={row.original.behavior} />,
      enableSorting: false,
      header: t('Features.Billing.UsageReports.Columns.behavior'),
      id: 'behavior',
    };
    const value: ColumnDef<UsageReport> = {
      cell: ({ row }) => (
        <div className={right}>
          {formatDecimalQuantity(row.original.reportedValue, language)}
        </div>
      ),
      enableSorting: false,
      header: rightAlignedHeader(
        t('Features.Billing.UsageReports.Columns.value'),
      ),
      id: 'value',
    };
    const counter: ColumnDef<UsageReport> = {
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatDecimalQuantity(row.original.valueBefore, language)}
          {' → '}
          {formatDecimalQuantity(row.original.valueAfter, language)}
        </span>
      ),
      enableSorting: false,
      header: t('Features.Billing.UsageReports.Columns.counter'),
      id: 'counter',
    };
    const delta: ColumnDef<UsageReport> = {
      cell: ({ row }) => (
        <div className={right}>
          {formatDecimalQuantity(row.original.delta, language)}
        </div>
      ),
      enableSorting: false,
      header: rightAlignedHeader(
        t('Features.Billing.UsageReports.Columns.delta'),
      ),
      id: 'delta',
    };
    const overageDelta: ColumnDef<UsageReport> = {
      cell: ({ row }) => (
        <div className={right}>
          {formatDecimalQuantity(row.original.overageDelta, language)}
        </div>
      ),
      enableSorting: false,
      header: rightAlignedHeader(
        t('Features.Billing.UsageReports.Columns.overageDelta'),
      ),
      id: 'overageDelta',
    };
    const limit: ColumnDef<UsageReport> = {
      cell: ({ row }) => (
        <LimitCell
          isChange={limitChanges.has(row.original.reportSeq)}
          limit={row.original.limitValue}
        />
      ),
      enableSorting: false,
      header: t('Features.Billing.UsageReports.Columns.limit'),
      id: 'limit',
    };
    const transaction: ColumnDef<UsageReport> = {
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.transactionId ?? '—'}
        </span>
      ),
      enableSorting: false,
      header: t('Features.Billing.UsageReports.Columns.transaction'),
      id: 'transaction',
    };
    const properties: ColumnDef<UsageReport> = {
      cell: ({ row }) => <PropertiesCell report={row.original} />,
      enableSorting: false,
      header: t('Features.Billing.UsageReports.Columns.properties'),
      id: 'properties',
    };

    return [
      report,
      reportedAt,
      behavior,
      ...(showValue ? [value] : []),
      counter,
      delta,
      ...(showOverage ? [overageDelta] : []),
      limit,
      transaction,
      properties,
    ];
  }, [language, limitChanges, showOverage, showValue, t]);
}
