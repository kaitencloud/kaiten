import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditTrail } from '@/api-client/types.gen';
import type { InstanceEntitlementRow } from '../../../../utils/instance-detail-entitlements.utils';
import {
  buildValueOverTimeData,
  buildValueOverTimeGroupData,
  buildValueOverTimeGroupEntitlementOptions,
  buildValueOverTimeNumericEntitlementOptions,
  buildValueOverTimeNumericGroupOptions,
  type ValueOverTimeMode,
} from './audit-trail.utils';
import { buildValueOverTimeGroupChartConfig } from './audit-trail-charts';
import type { SelectOption } from './audit-trail-select';

function useValueGroupVisibleEntitlementsState({
  selectedValueGroup,
  valueGroupEntitlementOptions,
}: {
  selectedValueGroup: string;
  valueGroupEntitlementOptions: Array<{ slug: string }>;
}) {
  const [valueGroupVisibleEntitlements, setValueGroupVisibleEntitlements] =
    useState<string[]>([]);

  const [prevSelectedValueGroup, setPrevSelectedValueGroup] = useState<
    string | null
  >(null);
  const [
    prevValueGroupEntitlementOptions,
    setPrevValueGroupEntitlementOptions,
  ] = useState(valueGroupEntitlementOptions);

  if (selectedValueGroup !== prevSelectedValueGroup) {
    setPrevSelectedValueGroup(selectedValueGroup);
    setPrevValueGroupEntitlementOptions(valueGroupEntitlementOptions);
    setValueGroupVisibleEntitlements(
      valueGroupEntitlementOptions.length > 1
        ? valueGroupEntitlementOptions.map((entitlement) => entitlement.slug)
        : [],
    );
  } else if (
    valueGroupEntitlementOptions !== prevValueGroupEntitlementOptions
  ) {
    setPrevValueGroupEntitlementOptions(valueGroupEntitlementOptions);
    const availableEntitlementSlugs = new Set(
      valueGroupEntitlementOptions.map((entitlement) => entitlement.slug),
    );
    setValueGroupVisibleEntitlements((currentValue) =>
      currentValue.filter((entitlementSlug) =>
        availableEntitlementSlugs.has(entitlementSlug),
      ),
    );
  }

  return {
    valueGroupVisibleEntitlements,
    setValueGroupVisibleEntitlements,
  };
}

export function useValueOverTimeChartState({
  entitlementsRows,
  entries,
  locale,
}: {
  entitlementsRows: InstanceEntitlementRow[];
  entries: AuditTrail[];
  locale: string;
}) {
  const { t } = useTranslation();
  const [valueOverTimeMode, setValueOverTimeMode] =
    useState<ValueOverTimeMode>('entitlement');
  const [valueEntitlement, setValueEntitlement] = useState<string>('');
  const [valueGroup, setValueGroup] = useState<string>('');

  const numberEntitlementOptions = useMemo(
    () => buildValueOverTimeNumericEntitlementOptions(entitlementsRows),
    [entitlementsRows],
  );
  const numberEntitlementSlugs = useMemo(
    () =>
      new Set(numberEntitlementOptions.map((entitlement) => entitlement.slug)),
    [numberEntitlementOptions],
  );
  const numberEntitlementSelectOptions = useMemo<SelectOption[]>(
    () =>
      numberEntitlementOptions.map((entitlement) => ({
        label: entitlement.label,
        value: entitlement.slug,
      })),
    [numberEntitlementOptions],
  );
  const valueGroupOptions = useMemo(
    () => buildValueOverTimeNumericGroupOptions(entitlementsRows),
    [entitlementsRows],
  );
  const selectedValueEntitlement = numberEntitlementOptions.some(
    (entitlement) => entitlement.slug === valueEntitlement,
  )
    ? valueEntitlement
    : (numberEntitlementOptions[0]?.slug ?? '');
  const selectedValueEntitlementOption = numberEntitlementOptions.find(
    (entitlement) => entitlement.slug === selectedValueEntitlement,
  );
  const selectedValueGroup = valueGroupOptions.some(
    (group) => group.value === valueGroup,
  )
    ? valueGroup
    : (valueGroupOptions[0]?.value ?? '');
  const selectedValueGroupOption = valueGroupOptions.find(
    (group) => group.value === selectedValueGroup,
  );
  const valueGroupEntitlementOptions = useMemo(
    () =>
      buildValueOverTimeGroupEntitlementOptions(
        entitlementsRows,
        selectedValueGroup,
      ),
    [entitlementsRows, selectedValueGroup],
  );
  const { setValueGroupVisibleEntitlements, valueGroupVisibleEntitlements } =
    useValueGroupVisibleEntitlementsState({
      selectedValueGroup,
      valueGroupEntitlementOptions,
    });
  const visibleValueGroupEntitlementOptions = useMemo(
    () =>
      valueGroupEntitlementOptions.filter((entitlement) =>
        valueGroupVisibleEntitlements.includes(entitlement.slug),
      ),
    [valueGroupEntitlementOptions, valueGroupVisibleEntitlements],
  );
  const shouldShowValueGroupEntitlementSelector =
    valueGroupEntitlementOptions.length > 1;
  // With no lifetime counter there is no group total to fall back on, so the
  // per-entitlement series carry the chart instead of an empty area.
  const hasGroupTotal = useMemo(
    () =>
      valueGroupEntitlementOptions.some(
        (entitlement) => !entitlement.isPeriodic,
      ),
    [valueGroupEntitlementOptions],
  );
  const effectiveValueGroupVisibleEntitlements = useMemo(
    () =>
      shouldShowValueGroupEntitlementSelector
        ? valueGroupVisibleEntitlements
        : hasGroupTotal
          ? []
          : valueGroupEntitlementOptions.map((entitlement) => entitlement.slug),
    [
      hasGroupTotal,
      shouldShowValueGroupEntitlementSelector,
      valueGroupEntitlementOptions,
      valueGroupVisibleEntitlements,
    ],
  );
  const effectiveVisibleValueGroupEntitlementOptions = useMemo(
    () =>
      shouldShowValueGroupEntitlementSelector
        ? visibleValueGroupEntitlementOptions
        : hasGroupTotal
          ? []
          : valueGroupEntitlementOptions,
    [
      hasGroupTotal,
      shouldShowValueGroupEntitlementSelector,
      valueGroupEntitlementOptions,
      visibleValueGroupEntitlementOptions,
    ],
  );
  const valueChartData = useMemo(
    () =>
      buildValueOverTimeData({
        entries,
        entitlementSlug: selectedValueEntitlement,
        locale,
        numberEntitlementSlugs,
      }),
    [entries, locale, numberEntitlementSlugs, selectedValueEntitlement],
  );
  const valueGroupChartData = useMemo(
    () =>
      buildValueOverTimeGroupData({
        entries,
        entitlementsRows,
        groupSlug: selectedValueGroup,
        locale,
        visibleEntitlementSlugs: effectiveValueGroupVisibleEntitlements,
      }),
    [
      effectiveValueGroupVisibleEntitlements,
      entries,
      entitlementsRows,
      locale,
      selectedValueGroup,
    ],
  );
  const currentValue =
    valueOverTimeMode === 'group'
      ? (valueGroupChartData.at(-1)?.groupTotal ?? null)
      : (valueChartData.at(-1)?.value ?? null);
  const shouldShowValueGroupLegend =
    effectiveVisibleValueGroupEntitlementOptions.length <= 6;

  return {
    currentValue,
    effectiveVisibleValueGroupEntitlementOptions,
    numberEntitlementSelectOptions,
    selectedValueEntitlement,
    selectedValueEntitlementOption,
    selectedValueGroup,
    selectedValueGroupOption,
    setValueEntitlement,
    setValueGroup,
    setValueGroupVisibleEntitlements,
    setValueOverTimeMode,
    shouldShowValueGroupEntitlementSelector,
    shouldShowValueGroupLegend,
    valueChartData,
    valueGroupChartConfig: buildValueOverTimeGroupChartConfig({
      entitlements: effectiveVisibleValueGroupEntitlementOptions,
      groupTotalLabel: t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.groupTotalLabel',
      ),
      periodicSuffix: t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.periodicSuffix',
      ),
    }),
    valueGroupChartData,
    valueGroupEntitlementOptions,
    valueGroupOptions,
    valueGroupVisibleEntitlements,
    valueOverTimeMode,
  };
}
