import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvoiceLine } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { type ColumnDef, DataTable } from '@/functionals/table';
import { cn } from '@/lib/utils';
import { BadgeExplanation } from './badge-explanation';
import { InvoiceLineTypeBadge } from './invoice-line-type-badge';
import { Money } from './money';
import { ServicePeriod } from './service-period';

type InvoiceLinesTableProps = {
  className?: string;
  /** The ISO 4217 code every amount of the lines is in. */
  currency: string;
  /** The lines of an invoice or of a preview, in the order the API sent them. */
  lines: InvoiceLine[];
  /**
   * What a screen adds under a line, which only that screen knows: the
   * fingerprint of the usage behind a metered line and the way to its reports.
   * A preview has none.
   */
  renderLineDetail?: (line: InvoiceLine) => ReactNode;
};

// A line says what it bills (its label and its type), how it was worked out (the
// API's own description of the arithmetic, shown as written), the period it
// bills and what that comes to. The amount is a field of the line: nothing here
// multiplies a quantity by a price.
function LineCell({
  line,
  renderLineDetail,
}: {
  line: InvoiceLine;
  renderLineDetail?: (line: InvoiceLine) => ReactNode;
}) {
  const { t } = useTranslation();

  return (
    // A cell of the table does not wrap, and the arithmetic of a line is a long
    // sentence: left alone it would push the amount out of the dialog it is in.
    <div className="min-w-0 space-y-1 py-1 whitespace-normal">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{line.label}</span>
        <InvoiceLineTypeBadge type={line.type} />
        {line.capped ? (
          <BadgeExplanation
            explanation={t('Features.Billing.InvoiceLines.cappedExplanation')}
          >
            <Badge variant="outline">
              {t('Features.Billing.InvoiceLines.capped')}
            </Badge>
          </BadgeExplanation>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{line.description}</p>
      {renderLineDetail?.(line)}
    </div>
  );
}

/**
 * The lines of an invoice, or of the preview of one: one row per line, with its
 * service period and its amount. The schema of a line is open and its price
 * members may be missing (a discount has no unit amount, an add-on no license
 * price), so a row shows only what every line has.
 */
export function InvoiceLinesTable({
  className,
  currency,
  lines,
  renderLineDetail,
}: InvoiceLinesTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<ColumnDef<InvoiceLine>[]>(
    () => [
      {
        id: 'line',
        enableSorting: false,
        header: t('Features.Billing.InvoiceLines.Columns.line'),
        cell: ({ row }) => (
          <LineCell line={row.original} renderLineDetail={renderLineDetail} />
        ),
      },
      {
        id: 'servicePeriod',
        enableSorting: false,
        header: t('Features.Billing.InvoiceLines.Columns.servicePeriod'),
        cell: ({ row }) => (
          <ServicePeriod
            className="text-xs text-muted-foreground"
            from={row.original.serviceFrom}
            to={row.original.serviceTo}
          />
        ),
      },
      {
        id: 'amount',
        enableSorting: false,
        header: () => (
          <div className="text-right">
            {t('Features.Billing.InvoiceLines.Columns.amount')}
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <Money amount={row.original.amount} currency={currency} />
          </div>
        ),
      },
    ],
    [currency, renderLineDetail, t],
  );

  return (
    <DataTable
      className={cn(className)}
      columns={columns}
      data={lines}
      emptyMessage={t('Features.Billing.InvoiceLines.empty')}
      getRowId={(line) => String(line.seq)}
      pagination={false}
      variant="simple"
    />
  );
}
