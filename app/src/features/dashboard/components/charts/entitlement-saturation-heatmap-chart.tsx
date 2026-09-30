import { useTranslation } from 'react-i18next';
import { ChartEmptyState } from '@/components/chart-empty-state';
import { capitalizeFromUpperCase } from '@/lib/utils';
import type { DashboardMetrics } from '../../hooks/use-dashboard-metrics';
import { ChartShell } from './chart-shell';

type EntitlementSaturationHeatmapChartProps = {
  data: DashboardMetrics['charts']['entitlementSaturationHeatmap'];
};

const bandColumns = [
  {
    key: 'under50' as const,
    labelKey:
      'Pages.Dashboard.charts.entitlementSaturationHeatmap.bands.under50',
    tone: 'bg-success-subtle text-success-subtle-foreground',
  },
  {
    key: 'between50And80' as const,
    labelKey:
      'Pages.Dashboard.charts.entitlementSaturationHeatmap.bands.between50And80',
    tone: 'bg-info-subtle text-info-subtle-foreground',
  },
  {
    key: 'between80And100' as const,
    labelKey:
      'Pages.Dashboard.charts.entitlementSaturationHeatmap.bands.between80And100',
    tone: 'bg-warning-subtle text-warning-subtle-foreground',
  },
  {
    key: 'over100' as const,
    labelKey:
      'Pages.Dashboard.charts.entitlementSaturationHeatmap.bands.over100',
    tone: 'bg-destructive-subtle text-destructive-subtle-foreground',
  },
  {
    key: 'unbounded' as const,
    labelKey:
      'Pages.Dashboard.charts.entitlementSaturationHeatmap.bands.unbounded',
    // "No limit" is not a severity, so it takes the neutral surface rather than a
    // sixth hue. The legend for these same bands already reads it that way.
    tone: 'bg-muted text-muted-foreground',
  },
];

export const EntitlementSaturationHeatmapChart = ({
  data,
}: EntitlementSaturationHeatmapChartProps) => {
  const { t } = useTranslation();

  function getLicenseTypeLabel(licenseType: string) {
    return t(
      `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(licenseType)}`,
      { defaultValue: licenseType },
    );
  }

  function renderBandHeader(column: (typeof bandColumns)[number]) {
    return (
      <div
        key={column.key}
        className="px-1 py-2 text-center font-medium whitespace-nowrap"
      >
        {t(column.labelKey)}
      </div>
    );
  }

  function renderHeatmapRow(
    row: DashboardMetrics['charts']['entitlementSaturationHeatmap'][number],
  ) {
    function renderHeatmapCell(column: (typeof bandColumns)[number]) {
      return (
        <div
          key={column.key}
          className={`rounded-md border px-1 py-2 text-center text-sm font-semibold tabular-nums ${column.tone}`}
        >
          {row[column.key]}
        </div>
      );
    }

    return (
      <div
        key={`${row.licenseType}-${row.usageScope}`}
        className="grid grid-cols-[minmax(132px,1.5fr)_repeat(5,minmax(0,1fr))] gap-2"
      >
        <div className="flex min-w-0 flex-col gap-0.5 rounded-md border px-2 py-2">
          <span className="text-sm font-medium">
            {getLicenseTypeLabel(row.licenseType)}
          </span>
          {/* Same bands, different meaning: a lifetime ratio only ever climbs,
              a periodic one is a sample of a cycle that clears on reset. */}
          <span className="text-xs text-muted-foreground">
            {t(
              `Pages.Dashboard.charts.entitlementSaturationHeatmap.scopes.${row.usageScope}`,
            )}
          </span>
        </div>
        {bandColumns.map(renderHeatmapCell)}
      </div>
    );
  }

  return (
    <ChartShell
      title={t('Pages.Dashboard.charts.entitlementSaturationHeatmap.title')}
      description={t(
        'Pages.Dashboard.charts.entitlementSaturationHeatmap.description',
      )}
      contentClassName="overflow-x-auto"
    >
      {data.length === 0 ? (
        <ChartEmptyState
          message={t(
            'Pages.Dashboard.charts.entitlementSaturationHeatmap.emptyState',
          )}
        />
      ) : (
        <div className="min-w-[480px]">
          <div className="grid grid-cols-[minmax(132px,1.5fr)_repeat(5,minmax(0,1fr))] gap-2 text-xs text-muted-foreground">
            <div className="px-3 py-2 font-medium">
              {t(
                'Pages.Dashboard.charts.entitlementSaturationHeatmap.licenseTypeAndScope',
              )}
            </div>
            {bandColumns.map(renderBandHeader)}
          </div>

          <div className="mt-2 space-y-2">{data.map(renderHeatmapRow)}</div>
        </div>
      )}
    </ChartShell>
  );
};
