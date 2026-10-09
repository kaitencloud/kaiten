import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addon, AddonFamily } from '@/api-client';
import { GradientButton } from '@/components/gradient-button';
import { ActionAccordion } from '@/components/ui/action-accordion';
import { ListEmptyState, useCanPerform } from '@/domains/billing';
import {
  type FilterFieldDefinition,
  FilterSearchInput,
  FilterToolbarFilterButton,
  FilterToolbarFiltersRow,
  FilterToolbarProvider,
  useFilterBuilder,
} from '@/functionals/filters';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  buildAddonGroups,
  getAllVersions,
} from '../../utils/addon-families.utils';
import {
  LIFECYCLE_LABEL_KEYS,
  PRICING_TYPE_LABEL_KEYS,
} from '../../utils/addon-labels';
import { AddonListItem } from './addon-list-item';

type AddonListProps = {
  families: AddonFamily[];
};

const LIFECYCLE_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const PRICING_TYPES = ['FREE', 'PAID', 'CUSTOM'] as const;

/**
 * The families of add-ons, each with its versions, to search and filter. The filters
 * run on the versions, in the browser, and a family is listed when any of its
 * versions is kept. They are values, valid across a refetch: an action on a version
 * must not wipe the search the vendor found it with.
 */
export function AddonList({ families }: AddonListProps) {
  const { t } = useTranslation();
  const mayCreate = useCanPerform('addons.create');
  const versions = useMemo(() => getAllVersions(families), [families]);
  const nameLabel = t('Pages.Addons.List.addonName');

  const filterFields = useMemo<FilterFieldDefinition<Addon>[]>(
    () => [
      {
        accessor: (addon) => addon.name,
        id: 'name',
        label: nameLabel,
        placeholder: nameLabel,
        type: 'text',
      },
      {
        accessor: (addon) => addon.lifecycleState,
        id: 'lifecycleState',
        label: t('Pages.Addons.VersionsTable.Columns.lifecycleState'),
        options: LIFECYCLE_STATES.map((state) => ({
          label: t(LIFECYCLE_LABEL_KEYS[state]),
          value: state,
        })),
        type: 'enum',
      },
      {
        accessor: (addon) => addon.pricingType,
        id: 'pricingType',
        label: t('Pages.Addons.VersionsTable.Columns.pricingType'),
        options: PRICING_TYPES.map((type) => ({
          label: t(PRICING_TYPE_LABEL_KEYS[type]),
          value: type,
        })),
        type: 'enum',
      },
    ],
    [nameLabel, t],
  );

  const filterController = useFilterBuilder({
    data: versions,
    debounceMs: 200,
    fields: filterFields,
    pinnedFilterIds: ['name'],
    resetOnDataChange: false,
  });
  const groups = useMemo(
    () => buildAddonGroups(filterController.filteredData, families),
    [families, filterController.filteredData],
  );
  const AddonIcon = dataModelIcons.addon;

  if (families.length === 0) {
    return (
      <div className="pt-6">
        <ListEmptyState
          description={t('Pages.Addons.List.Empty.description')}
          icon={AddonIcon}
          testId="addons-empty"
          title={t('Pages.Addons.List.Empty.title')}
        >
          {mayCreate ? (
            <GradientButton
              label={t('Pages.Addons.Form.titleNew')}
              to="/addons/new"
            />
          ) : null}
        </ListEmptyState>
      </div>
    );
  }

  return (
    <FilterToolbarProvider controller={filterController}>
      <div className="flex h-full min-h-0 flex-col pt-6">
        <div className="space-y-3 shrink-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-start">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
              <FilterSearchInput
                className="w-full sm:w-[320px]"
                filterId="name"
              />
              <FilterToolbarFilterButton className="sm:shrink-0" />
            </div>
            {mayCreate ? (
              <div className="flex items-center md:ml-auto">
                <GradientButton
                  label={t('Pages.Addons.Form.titleNew')}
                  to="/addons/new"
                />
              </div>
            ) : null}
          </div>
          <FilterToolbarFiltersRow />
        </div>

        <div className="mt-6 min-h-0 flex-1 overflow-auto pr-1">
          {groups.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              {t('Common.noResults')}
            </div>
          ) : (
            <ActionAccordion
              className="w-full space-y-4"
              defaultValue={groups[0] ? [groups[0].family.id] : []}
              multiple
            >
              {groups.map((group) => (
                <AddonListItem group={group} key={group.family.id} />
              ))}
            </ActionAccordion>
          )}
        </div>
      </div>
    </FilterToolbarProvider>
  );
}
