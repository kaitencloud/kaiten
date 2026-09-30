import { BarChart3 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditTrail } from '@/api-client/types.gen';
import { ChartShell } from '@/components/ui/chart-shell';
import type { InstanceEntitlementRow } from '../../../../utils/instance-detail-entitlements.utils';
import { dataModelIcons } from '@/lib/data-model-icons';
import { EntitlementGroupFilterSelect } from '../../entitlement-group-filter-select';
import {
  ActivityTimelineModeToggle,
  GroupModeStatusQuickFilters,
  SeriesVisibilityToggleGroup,
} from './activity-timeline-controls';
import { ActivityTimelineVisibleGroupsSelect } from './activity-timeline-visible-groups-select';
import { ActivityTimelineChart } from './audit-trail-charts';
import { OptionSelect, type SelectOption } from './audit-trail-select';
import type { EventCategory } from './audit-trail.types';
import { useActivityTimelineChartState } from './use-activity-timeline-chart-state';

const EntitlementGlyph = dataModelIcons.entitlement;

function getStatusVisibility(
  selectedStatuses: string[],
): Record<EventCategory, boolean> {
  return {
    accepted: selectedStatuses.includes('accepted'),
    read: selectedStatuses.includes('read'),
    rejected: selectedStatuses.includes('rejected'),
    warning: selectedStatuses.includes('warning'),
  };
}

export function ActivityTimelineCard({
  entitlementsRows,
  entries,
  locale,
}: {
  entitlementsRows: InstanceEntitlementRow[];
  entries: AuditTrail[];
  locale: string;
}) {
  const { t } = useTranslation();
  const state = useActivityTimelineChartState({
    entitlementsRows,
    entries,
    locale,
  });

  const activityEntitlementSelectOptions = useMemo<SelectOption[]>(
    () =>
      state.activityEntitlementOptions.map((entitlement) => ({
        label: entitlement.label,
        value: entitlement.slug,
      })),
    [state.activityEntitlementOptions],
  );

  return (
    <ChartShell
      title={t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.title',
      )}
      description={t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.description',
      )}
      titleIcon={<BarChart3 />}
      contentClassName="space-y-4"
      headerActions={
        <ActivityTimelineModeToggle
          value={state.activityTimelineMode}
          onChange={state.setActivityTimelineMode}
        />
      }
    >
      {state.activityTimelineMode === 'status' ? (
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-2 lg:items-center">
            <EntitlementGlyph
              className="text-muted-foreground mt-2 size-4 shrink-0 lg:mt-0"
              aria-hidden
            />
            <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-2">
              <EntitlementGroupFilterSelect
                ariaLabel={t(
                  'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.groupFilterLabel',
                )}
                allGroupsLabel={t(
                  'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.allGroups',
                )}
                options={state.activityGroupOptions}
                value={state.activityGroupFilter}
                onChange={state.setActivityGroupFilter}
              />
              <OptionSelect
                ariaLabel={t(
                  'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.entitlementFilterLabel',
                )}
                allLabel={t(
                  'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.allEntitlements',
                )}
                includeAllOption
                options={activityEntitlementSelectOptions}
                value={state.selectedActivityEntitlement}
                onChange={state.setActivityEntitlementFilter}
              />
            </div>
          </div>
          <div className="flex justify-start xl:justify-end">
            <SeriesVisibilityToggleGroup
              visibleSeries={state.statusModeVisibleSeries}
              onToggle={state.toggleStatusModeSeries}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] xl:items-start">
          <ActivityTimelineVisibleGroupsSelect
            ariaLabel={t(
              'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.visibleGroupsLabel',
            )}
            options={state.activityGroupOptions}
            value={state.groupModeVisibleGroups}
            onChange={state.setGroupModeVisibleGroups}
            triggerClassName="xl:max-w-[320px]"
          />
          <div className="min-w-0">
            <GroupModeStatusQuickFilters
              visibleSeries={getStatusVisibility(state.groupModeStatusKeys)}
              onToggle={state.toggleGroupModeStatus}
            />
          </div>
        </div>
      )}
      <ActivityTimelineChart
        chartConfig={
          state.activityTimelineMode === 'status'
            ? state.statusModeChartConfig
            : state.groupModeChartConfig
        }
        chartData={
          state.activityTimelineMode === 'status'
            ? state.statusModeChartData
            : state.groupModeChartData
        }
        mode={state.activityTimelineMode}
        seriesKeys={
          state.activityTimelineMode === 'status'
            ? state.statusModeSeriesKeys
            : state.visibleGroupOptions.map((group) => group.value)
        }
      />
    </ChartShell>
  );
}
