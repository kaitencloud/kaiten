import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useExportUsageHistory } from '../../../../../hooks/use-export-usage-history';
import { useUsageHistory } from '../../../../../hooks/use-usage-history';
import type { UsageHistoryRange } from '../../../../../queries';
import { UsageHistoryReports } from './usage-history-reports';
import { UsageHistoryToolbar } from './usage-history-toolbar';

type UsageHistoryDrawerProps = {
  entitlementName: string;
  entitlementSlug: string;
  instanceName: string;
  instanceSlug: string;
  /** Closes the drawer: the route drops the entitlement it was opened on. */
  onClose: () => void;
  /** Writes the period to the URL, which the drawer then reads it back from. */
  onRangeChange: (range: UsageHistoryRange) => void;
  /** The period the URL holds; an open end is the API's default. */
  range: UsageHistoryRange;
};

/**
 * The usage reports of one entitlement on the instance, the drawer the URL opens
 * (`?history=<entitlementSlug>`) so that it can be linked to, from the invoice
 * that would be held for it as much as from the row of the entitlement, and the
 * back button closes it. It lists them in the order they were accepted, a page
 * at a time, for a period of days it can be narrowed to, and exports the period as
 * a CSV. The period is the API's filter and lives in the URL with the drawer
 * (`?from=` and `?to=`), so that a link carries it and a reload keeps it. It reads
 * the instances, and billing being on or off has no say in it.
 */
export function UsageHistoryDrawer({
  entitlementName,
  entitlementSlug,
  instanceName,
  instanceSlug,
  onClose,
  onRangeChange,
  range,
}: UsageHistoryDrawerProps) {
  const { t } = useTranslation();
  const history = useUsageHistory(instanceSlug, entitlementSlug, range);
  const exportHistory = useExportUsageHistory();

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent
        className="w-full gap-0 sm:max-w-5xl"
        data-testid="usage-history"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>
            {t('Pages.Customers.Instances.Detail.entitlements.history.title')}
          </SheetTitle>
          <SheetDescription>
            {t(
              'Pages.Customers.Instances.Detail.entitlements.history.description',
              { entitlement: entitlementName, instance: instanceName },
            )}
          </SheetDescription>
        </SheetHeader>
        {/* A native container and not a ScrollArea: that lets its content grow to
            its natural width, and the table of reports must scroll inside its own
            container on a phone. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <UsageHistoryToolbar
            isExporting={exportHistory.isPending}
            onChange={onRangeChange}
            onExport={() =>
              exportHistory.mutate({ entitlementSlug, instanceSlug, range })
            }
            range={range}
          />
          <section
            aria-label={t(
              'Pages.Customers.Instances.Detail.entitlements.history.region',
              { entitlement: entitlementName },
            )}
          >
            <UsageHistoryReports
              history={history}
              onStartFrom={(from) => onRangeChange({ ...range, from })}
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
