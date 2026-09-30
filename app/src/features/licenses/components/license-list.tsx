import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LicenseFamilyView } from '@/api-client';
import { GradientButton } from '@/components/gradient-button';
import { ActionAccordion } from '@/components/ui/action-accordion';
import {
  type FilterFieldDefinition,
  FilterSearchInput,
  FilterToolbarFilterButton,
  FilterToolbarFiltersRow,
  FilterToolbarProvider,
  useFilterBuilder,
} from '@/functionals/filters';
import type { LicenseWithInstances } from '../types';
import {
  buildLicenseGroups,
  normalizeLicenseFamilyName,
} from '../utils/license-list.utils';
import { LicenseListItem } from './license-list-item';

type LicenseListProps = {
  families: LicenseFamilyView[];
  licenses: LicenseWithInstances[];
};

export const LicenseList = ({ families, licenses }: LicenseListProps) => {
  const { t } = useTranslation();
  const unknownVersionLabel = t('Pages.Licenses.List.unknownVersion');
  const licenseNameLabel = t('Pages.Licenses.List.licenseName');
  const typeOptions = useMemo(() => {
    return [...new Set(licenses.map((license) => license.type))]
      .sort()
      .map((type) => ({
        label: type,
        value: type,
      }));
  }, [licenses]);

  const versionNameOptions = useMemo(() => {
    return [
      ...new Set(
        licenses.map(
          (license) => license.versionName?.trim() || unknownVersionLabel,
        ),
      ),
    ]
      .sort((left, right) => left.localeCompare(right))
      .map((versionName) => ({
        label: versionName,
        value: versionName,
      }));
  }, [licenses, unknownVersionLabel]);

  const filterFields = useMemo<FilterFieldDefinition<LicenseWithInstances>[]>(
    () => [
      {
        id: 'name',
        label: licenseNameLabel,
        type: 'text',
        accessor: (license) => normalizeLicenseFamilyName(license.name),
        placeholder: licenseNameLabel,
      },
      {
        id: 'type',
        label: t('Pages.Licenses.Table.Columns.type', 'Type'),
        type: 'enum',
        accessor: (license) => license.type,
        options: typeOptions,
      },
      {
        id: 'versionName',
        label: t('Pages.Licenses.List.versionName'),
        type: 'enum',
        accessor: (license) =>
          license.versionName?.trim() || unknownVersionLabel,
        options: versionNameOptions,
      },
      {
        id: 'version',
        label: t('Pages.Licenses.Table.Columns.version', 'Version'),
        type: 'text',
        accessor: (license) => license.version,
      },
    ],
    [licenseNameLabel, t, typeOptions, unknownVersionLabel, versionNameOptions],
  );

  const filterController = useFilterBuilder({
    data: licenses,
    fields: filterFields,
    pinnedFilterIds: ['name'],
    debounceMs: 200,
    // The filters are values, valid across a refetch: an action on a version
    // must not wipe the search the vendor found it with.
    resetOnDataChange: false,
  });

  const groupedLicenses = useMemo(
    () => buildLicenseGroups(filterController.filteredData, families),
    [families, filterController.filteredData],
  );
  const defaultExpandedGroup = groupedLicenses[0]?.familyId;

  return (
    <FilterToolbarProvider controller={filterController}>
      <div className="flex h-full min-h-0 flex-col pt-6">
        <div className="space-y-3 shrink-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-start">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
              <FilterSearchInput
                filterId="name"
                className="w-full sm:w-[320px]"
              />
              <FilterToolbarFilterButton className="sm:shrink-0" />
            </div>
            <div className="flex items-center md:ml-auto">
              <GradientButton
                to="/licenses/new"
                label={t('Pages.Licenses.Mutation.titleNew')}
              />
            </div>
          </div>
          <FilterToolbarFiltersRow />
        </div>

        <div className="mt-6 flex-1 min-h-0 overflow-auto pr-1">
          {groupedLicenses.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              {t('Common.noResults')}
            </div>
          ) : (
            <ActionAccordion
              type="multiple"
              defaultValue={defaultExpandedGroup ? [defaultExpandedGroup] : []}
              className="w-full space-y-4"
            >
              {groupedLicenses.map((group) => (
                <LicenseListItem key={group.familyId} group={group} />
              ))}
            </ActionAccordion>
          )}
        </div>
      </div>
    </FilterToolbarProvider>
  );
};
