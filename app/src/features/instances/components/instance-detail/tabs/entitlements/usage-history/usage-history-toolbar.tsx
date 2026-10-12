import { Download, Loader2 } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PeriodFilter } from '@/domains/billing';
import type { UsageHistoryRange } from '../../../../../queries';
import { isPeriodTooLongToExport } from '../../../../../utils/usage-history.utils';

type UsageHistoryToolbarProps = {
  /** Whether the CSV of the period is being written. */
  isExporting: boolean;
  onChange: (range: UsageHistoryRange) => void;
  onExport: () => void;
  range: UsageHistoryRange;
};

/**
 * The period of the history, in days read in UTC, and the export of what it
 * selects. With no period the API reads the last 30 days, which the line under the
 * dates says. The CSV covers a period up to 366 days: a longer one keeps the
 * button where it is, disabled, and says why instead of offering what the API
 * would refuse.
 */
export function UsageHistoryToolbar({
  isExporting,
  onChange,
  onExport,
  range,
}: UsageHistoryToolbarProps) {
  const { t } = useTranslation();
  const reasonId = useId();
  const tooLong = isPeriodTooLongToExport(range);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="sm:w-96">
          <PeriodFilter
            from={range.from}
            label={t(
              'Pages.Customers.Instances.Detail.entitlements.history.period',
            )}
            onChange={onChange}
            to={range.to}
          />
        </div>
        <Button
          aria-describedby={tooLong ? reasonId : undefined}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          disabled={isExporting || tooLong}
          focusableWhenDisabled
          onClick={onExport}
          type="button"
          variant="outline"
        >
          {isExporting ? <Loader2 className="animate-spin" /> : <Download />}
          {t('Pages.Customers.Instances.Detail.entitlements.history.export')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'Pages.Customers.Instances.Detail.entitlements.history.defaultPeriod',
        )}
      </p>
      {tooLong ? (
        <p
          className="text-xs text-destructive-subtle-foreground"
          data-testid="usage-history-export-too-long"
          id={reasonId}
        >
          {t(
            'Pages.Customers.Instances.Detail.entitlements.history.exportTooLong',
          )}
        </p>
      ) : null}
    </div>
  );
}
