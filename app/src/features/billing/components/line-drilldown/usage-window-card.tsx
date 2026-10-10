import { useTranslation } from 'react-i18next';
import { ServicePeriod, useUsageReportColumns } from '@/domains/billing';
import { DataTable, TableCard } from '@/functionals/table';
import { formatDecimalQuantity } from '@/lib/decimal';
import type { UsageWindow } from '../../utils/usage-windows';

type UsageWindowCardProps = {
  /** More reports follow, so the sum of this window may not be whole yet. */
  isPartial: boolean;
  /** The numbers of the reports where the limit in force changed. */
  limitChanges: ReadonlySet<number>;
  /** Which sum the line is measured by: usage for a USAGE line, above the limit for an OVERAGE one. */
  measuresOverage: boolean;
  window: UsageWindow;
};

/**
 * The usage reports of one reset window, in the order they were accepted, with
 * the sum of the window above them. A window is the period an entitlement counts
 * over (a month, a day); the quantity of a line is the sum of its windows, each
 * floored at zero, so a line that spans two months shows two. The row where the
 * limit in force moved (an add-on, a boost) is marked, since it explains an
 * overage that is not the usage minus the limit of today. While reports are still
 * to be read, the last window gives no sum: half a window would read as a result.
 */
export function UsageWindowCard({
  isPartial,
  limitChanges,
  measuresOverage,
  window,
}: UsageWindowCardProps) {
  const { i18n, t } = useTranslation();
  const columns = useUsageReportColumns({ limitChanges, showOverage: true });
  const sum = measuresOverage ? window.sumOverageDelta : window.sumDelta;
  const hasWindow = window.start !== undefined && window.end !== undefined;

  return (
    <div data-testid="usage-window">
      <TableCard>
        <TableCard.Header>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle className="text-base">
              {hasWindow ? (
                <ServicePeriod from={window.start} to={window.end} />
              ) : (
                t('Pages.Billing.Invoices.Drilldown.lifetime')
              )}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              <span data-testid="usage-window-sum">
                {isPartial
                  ? t('Pages.Billing.Invoices.Drilldown.windowPartial', {
                      count: window.reports.length,
                    })
                  : t(
                      measuresOverage
                        ? 'Pages.Billing.Invoices.Drilldown.windowOverage'
                        : 'Pages.Billing.Invoices.Drilldown.windowUsage',
                      {
                        count: window.reports.length,
                        sum: formatDecimalQuantity(sum, i18n.language),
                      },
                    )}
              </span>
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.Header>
        <TableCard.Content>
          <DataTable
            columns={columns}
            data={window.reports}
            getRowClassName={(report) =>
              limitChanges.has(report.reportSeq) ? 'bg-muted/60' : undefined
            }
            getRowId={(report) => String(report.reportSeq)}
            pagination={false}
            variant="simple"
          />
        </TableCard.Content>
      </TableCard>
    </div>
  );
}
