import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import type { Entitlement } from '@/api-client';
import type { FilterFieldDefinition } from '@/functionals/filters';

type EnumOption = { label: string; value: string };

const toEnumOptions = (values: (string | null | undefined)[]): EnumOption[] =>
  [...new Set(values)]
    .filter((value): value is string => value != null)
    .sort()
    .map((value) => ({ label: value, value }));

/**
 * Builds the filter facets of the entitlements table. Enum options are derived
 * from the rows themselves, so a facet only offers values actually present.
 */
export function useEntitlementTableFilterFields(
  entitlements: Entitlement[],
  t: TFunction,
): FilterFieldDefinition<Entitlement>[] {
  const typeOptions = useMemo(
    () => toEnumOptions(entitlements.map((entitlement) => entitlement.type)),
    [entitlements],
  );

  const aggregationMethodOptions = useMemo(
    () =>
      toEnumOptions(
        entitlements.map((entitlement) => entitlement.aggregationMethod),
      ),
    [entitlements],
  );

  const groupOptions = useMemo(() => {
    const groupsBySlug = new Map<string, EnumOption>();

    for (const entitlement of entitlements) {
      for (const group of entitlement.entitlementGroups ?? []) {
        groupsBySlug.set(group.slug, {
          label: group.name,
          value: group.slug,
        });
      }
    }

    return [...groupsBySlug.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [entitlements]);

  return useMemo(
    () => [
      {
        id: 'name',
        label: t('Pages.Entitlements.Table.Columns.name', 'Name'),
        type: 'text',
        accessor: (entitlement) => entitlement.name,
        placeholder: t('Pages.Entitlements.Table.Columns.name', 'Name'),
      },
      {
        id: 'description',
        label: t('Pages.Entitlements.Table.Columns.description', 'Description'),
        type: 'text',
        accessor: (entitlement) => entitlement.description ?? '',
      },
      {
        id: 'type',
        label: t('Pages.Entitlements.Table.Columns.type', 'Type'),
        type: 'enum',
        accessor: (entitlement) => entitlement.type,
        options: typeOptions,
      },
      {
        id: 'groups',
        label: t('Pages.Entitlements.Table.Columns.groups', 'Groups'),
        type: 'enum',
        accessor: (entitlement) =>
          entitlement.entitlementGroups?.map((group) => group.slug) ?? [],
        options: groupOptions,
      },
      {
        id: 'aggregationMethod',
        label: t(
          'Pages.Entitlements.Table.Columns.aggregationMethod',
          'Aggregation',
        ),
        type: 'enum',
        accessor: (entitlement) => entitlement.aggregationMethod,
        options: aggregationMethodOptions,
      },
    ],
    [aggregationMethodOptions, groupOptions, t, typeOptions],
  );
}
