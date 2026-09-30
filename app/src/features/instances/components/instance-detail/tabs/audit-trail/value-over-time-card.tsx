import { ChartSpline } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AuditTrail } from '@/api-client/types.gen';
import { ChartShell } from '@/components/ui/chart-shell';
import type { InstanceEntitlementRow } from '../../../../utils/instance-detail-entitlements.utils';
import { ValueOverTimeChart } from './audit-trail-charts';
import { OptionSelect } from './audit-trail-select';
import { useValueOverTimeChartState } from './use-value-over-time-chart-state';
import {
  ValueOverTimeModeToggle,
  ValueOverTimeSummary,
} from './value-over-time-controls';
import { ValueOverTimeVisibleEntitlementsSelect } from './value-over-time-visible-entitlements-select';

export function ValueOverTimeCard({
  entitlementsRows,
  entries,
  locale,
}: {
  entitlementsRows: InstanceEntitlementRow[];
  entries: AuditTrail[];
  locale: string;
}) {
  const { t } = useTranslation();
  const state = useValueOverTimeChartState({
    entitlementsRows,
    entries,
    locale,
  });

  if (
    !state.selectedValueEntitlementOption &&
    !state.selectedValueGroupOption
  ) {
    return null;
  }

  return (
    <ChartShell
      title={t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.title',
      )}
      description={t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.description',
      )}
      titleIcon={<ChartSpline />}
      contentClassName="space-y-4"
      headerActions={
        <ValueOverTimeModeToggle
          value={state.valueOverTimeMode}
          onChange={state.setValueOverTimeMode}
        />
      }
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <ValueOverTimeSummary
          currentValue={state.currentValue}
          locale={locale}
          mode={state.valueOverTimeMode}
          numericEntitlementsCount={state.valueGroupEntitlementOptions.length}
          selectedEntitlement={state.selectedValueEntitlementOption}
          selectedGroup={state.selectedValueGroupOption}
        />
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {state.valueOverTimeMode === 'group' &&
          state.selectedValueGroupOption &&
          state.shouldShowValueGroupEntitlementSelector ? (
            <div className="min-w-0 flex-1 sm:max-w-md">
              <ValueOverTimeVisibleEntitlementsSelect
                ariaLabel={t(
                  'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.visibleEntitlementsLabel',
                )}
                options={state.valueGroupEntitlementOptions}
                value={state.valueGroupVisibleEntitlements}
                onChange={state.setValueGroupVisibleEntitlements}
                onSelectAll={() =>
                  state.setValueGroupVisibleEntitlements(
                    state.valueGroupEntitlementOptions.map(
                      (entitlement) => entitlement.slug,
                    ),
                  )
                }
                onClear={() => state.setValueGroupVisibleEntitlements([])}
              />
            </div>
          ) : null}
          {state.valueOverTimeMode === 'group' ? (
            <OptionSelect
              ariaLabel={t(
                'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.groupFilterLabel',
              )}
              options={state.valueGroupOptions}
              value={state.selectedValueGroup}
              onChange={state.setValueGroup}
            />
          ) : (
            <OptionSelect
              ariaLabel={t(
                'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.entitlementFilterLabel',
              )}
              options={state.numberEntitlementSelectOptions}
              value={state.selectedValueEntitlement}
              onChange={state.setValueEntitlement}
            />
          )}
          {state.shouldShowValueGroupEntitlementSelector &&
          !state.shouldShowValueGroupLegend &&
          state.effectiveVisibleValueGroupEntitlementOptions.length > 6 ? (
            <span className="text-xs text-muted-foreground">
              {t(
                'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.visibleEntitlementLinesCount',
                {
                  count:
                    state.effectiveVisibleValueGroupEntitlementOptions.length,
                },
              )}
            </span>
          ) : null}
        </div>
      </div>
      <ValueOverTimeChart
        chartConfig={
          state.valueOverTimeMode === 'group'
            ? state.valueGroupChartConfig
            : undefined
        }
        chartData={
          state.valueOverTimeMode === 'group'
            ? state.valueGroupChartData
            : state.valueChartData
        }
        locale={locale}
        mode={state.valueOverTimeMode}
        seriesKeys={state.effectiveVisibleValueGroupEntitlementOptions.map(
          (entitlement) => entitlement.slug,
        )}
        showLegend={
          state.valueOverTimeMode === 'group' &&
          state.shouldShowValueGroupLegend
        }
      />
    </ChartShell>
  );
}
