import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditTrail } from '@/api-client/types.gen';
import {
  buildInstanceEntitlementGroupOptions,
  filterEntitlementsRowsByGroup,
  type InstanceEntitlementRow,
} from '../../../../utils/instance-detail-entitlements.utils';
import { ACTIVITY_SERIES_ORDER } from './activity-timeline-controls';
import {
  type ActivityTimelineMode,
  buildActivityTimelineGroupData,
  buildActivityTimelineStatusData,
  buildAuditTrailEntitlementOptions,
  type EventCategory,
} from './audit-trail.utils';
import {
  buildActivityTimelineGroupChartConfig,
  buildActivityTimelineStatusChartConfig,
} from './audit-trail-charts';

const DEFAULT_VISIBLE_STATUSES: Record<EventCategory, boolean> = {
  accepted: true,
  read: true,
  rejected: true,
  warning: true,
};

const getInitialVisibleGroups = (entitlementsRows: InstanceEntitlementRow[]) =>
  buildInstanceEntitlementGroupOptions(entitlementsRows).map(
    (option) => option.value,
  );

export function useActivityTimelineChartState({
  entitlementsRows,
  entries,
  locale,
}: {
  entitlementsRows: InstanceEntitlementRow[];
  entries: AuditTrail[];
  locale: string;
}) {
  const { t } = useTranslation();
  const [activityTimelineMode, setActivityTimelineMode] =
    useState<ActivityTimelineMode>('status');
  const [activityEntitlementFilter, setActivityEntitlementFilter] =
    useState<string>('all');
  const [activityGroupFilter, setActivityGroupFilter] = useState<string>('all');
  const [groupModeVisibleGroups, setGroupModeVisibleGroups] = useState<
    string[]
  >(() => getInitialVisibleGroups(entitlementsRows));
  const [
    hasInitializedGroupModeVisibleGroups,
    setHasInitializedGroupModeVisibleGroups,
  ] = useState(
    () => buildInstanceEntitlementGroupOptions(entitlementsRows).length > 0,
  );
  const [groupModeVisibleStatuses, setGroupModeVisibleStatuses] = useState<
    Record<EventCategory, boolean>
  >(DEFAULT_VISIBLE_STATUSES);
  const [statusModeVisibleSeries, setStatusModeVisibleSeries] = useState<
    Record<EventCategory, boolean>
  >(DEFAULT_VISIBLE_STATUSES);

  const activityGroupOptions = useMemo(
    () => buildInstanceEntitlementGroupOptions(entitlementsRows),
    [entitlementsRows],
  );
  const groupFilteredEntitlementsRows = useMemo(
    () => filterEntitlementsRowsByGroup(entitlementsRows, activityGroupFilter),
    [activityGroupFilter, entitlementsRows],
  );
  const activityEntitlementOptions = useMemo(
    () => buildAuditTrailEntitlementOptions(groupFilteredEntitlementsRows),
    [groupFilteredEntitlementsRows],
  );
  const selectedActivityEntitlement = activityEntitlementOptions.some(
    (entitlement) => entitlement.slug === activityEntitlementFilter,
  )
    ? activityEntitlementFilter
    : 'all';
  const statusModeSeriesKeys = useMemo(
    () =>
      ACTIVITY_SERIES_ORDER.filter(
        (category) => statusModeVisibleSeries[category],
      ),
    [statusModeVisibleSeries],
  );
  const groupModeStatusKeys = useMemo(
    () =>
      ACTIVITY_SERIES_ORDER.filter(
        (category) => groupModeVisibleStatuses[category],
      ),
    [groupModeVisibleStatuses],
  );
  const statusModeChartData = useMemo(
    () =>
      buildActivityTimelineStatusData({
        entries,
        entitlementsRows,
        groupFilter: activityGroupFilter,
        entitlementFilter: selectedActivityEntitlement,
        locale,
      }),
    [
      activityGroupFilter,
      entries,
      entitlementsRows,
      locale,
      selectedActivityEntitlement,
    ],
  );
  const visibleGroupOptions = useMemo(
    () =>
      activityGroupOptions.filter((group) =>
        groupModeVisibleGroups.includes(group.value),
      ),
    [activityGroupOptions, groupModeVisibleGroups],
  );
  const groupModeChartData = useMemo(
    () =>
      buildActivityTimelineGroupData({
        entries,
        entitlementsRows,
        includedGroupSlugs: visibleGroupOptions.map((group) => group.value),
        includedStatuses: groupModeStatusKeys,
        locale,
      }),
    [
      entries,
      entitlementsRows,
      groupModeStatusKeys,
      locale,
      visibleGroupOptions,
    ],
  );

  const [prevActivityEntitlementOptions, setPrevActivityEntitlementOptions] =
    useState(activityEntitlementOptions);
  if (activityEntitlementOptions !== prevActivityEntitlementOptions) {
    setPrevActivityEntitlementOptions(activityEntitlementOptions);
    if (
      activityEntitlementFilter !== 'all' &&
      !activityEntitlementOptions.some(
        (entitlement) => entitlement.slug === activityEntitlementFilter,
      )
    ) {
      setActivityEntitlementFilter('all');
    }
  }

  const [prevActivityGroupOptions, setPrevActivityGroupOptions] = useState<
    typeof activityGroupOptions | null
  >(null);
  if (activityGroupOptions !== prevActivityGroupOptions) {
    setPrevActivityGroupOptions(activityGroupOptions);

    const availableGroupSlugs = new Set(
      activityGroupOptions.map((group) => group.value),
    );

    if (!hasInitializedGroupModeVisibleGroups) {
      if (activityGroupOptions.length > 0) {
        setGroupModeVisibleGroups(
          activityGroupOptions.map((group) => group.value),
        );
        setHasInitializedGroupModeVisibleGroups(true);
      }
    } else {
      setGroupModeVisibleGroups(
        groupModeVisibleGroups.filter((groupSlug) =>
          availableGroupSlugs.has(groupSlug),
        ),
      );
    }
  }

  return {
    activityEntitlementOptions,
    activityGroupFilter,
    activityGroupOptions,
    activityTimelineMode,
    groupModeChartConfig:
      buildActivityTimelineGroupChartConfig(visibleGroupOptions),
    groupModeChartData,
    groupModeStatusKeys,
    groupModeVisibleGroups,
    selectedActivityEntitlement,
    setActivityEntitlementFilter,
    setActivityGroupFilter,
    setActivityTimelineMode,
    setGroupModeVisibleGroups,
    statusModeChartConfig: buildActivityTimelineStatusChartConfig(t),
    statusModeChartData,
    statusModeSeriesKeys,
    statusModeVisibleSeries,
    toggleGroupModeStatus(category: EventCategory) {
      setGroupModeVisibleStatuses((currentValue) => ({
        ...currentValue,
        [category]: !currentValue[category],
      }));
    },
    toggleStatusModeSeries(category: EventCategory) {
      setStatusModeVisibleSeries((currentValue) => ({
        ...currentValue,
        [category]: !currentValue[category],
      }));
    },
    visibleGroupOptions,
  };
}
