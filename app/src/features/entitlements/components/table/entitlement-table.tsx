import { useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { GradientButton } from '@/components/gradient-button';
import { useDeletionRefusal } from '@/domains/billing';
import { useFilterBuilder } from '@/functionals/filters';
import { DataTable, FilterTableLayout } from '@/functionals/table';
import { createEntitlementTableColumns } from './entitlement-table-columns';
import { useEntitlementTableFilterFields } from './use-entitlement-table-filters';

export function EntitlementsTable({
  entitlements,
}: {
  entitlements: Entitlement[];
}) {
  const { t } = useTranslation();
  const router = useRouter();

  // An entitlement that is still granted, counted or priced is kept, and the
  // dialog that says so is held here, above the rows: a row leaves the list while
  // the API answers and, when it is the last, unmounts, with whatever it holds.
  const deletion = useDeletionRefusal();
  const columns = useMemo(
    () => createEntitlementTableColumns(t, deletion.showRefusal),
    [t, deletion.showRefusal],
  );
  const filterFields = useEntitlementTableFilterFields(entitlements, t);

  const filterController = useFilterBuilder({
    data: entitlements,
    fields: filterFields,
    pinnedFilterIds: ['name'],
    debounceMs: 200,
    resetOnDataChange: true,
  });

  const getEntitlementPath = (entitlement: Entitlement) =>
    entitlement.slug
      ? router.buildLocation({
          to: '/entitlements/$entitlementSlug',
          params: { entitlementSlug: entitlement.slug },
        }).pathname
      : undefined;

  return (
    <FilterTableLayout controller={filterController}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search filterId="name" />
          <FilterTableLayout.Actions>
            <GradientButton
              to="/entitlements/new"
              label={t('Pages.Entitlements.Mutation.titleNew')}
            />
          </FilterTableLayout.Actions>
        </FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Filters />
      </FilterTableLayout.Toolbar>

      <FilterTableLayout.Content>
        <DataTable
          className="h-full"
          columns={columns}
          data={filterController.filteredData}
          getPath={getEntitlementPath}
          bodyScrollable
        />
        {deletion.dialog}
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}
