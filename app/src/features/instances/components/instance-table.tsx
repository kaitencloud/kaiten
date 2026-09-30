import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GradientButton } from '@/components/gradient-button';
import { metadataFieldsActiveQueryOptions } from '@/domains/metadata-fields';
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import {
  buildFiltersFromSchema,
  type MetadataFieldDescriptor,
} from '@/functionals/metadata-fields';
import { DataTable, FilterTableLayout } from '@/functionals/table';
import {
  getInstanceStatusFilterOptions,
  getLifecycleStageLabel,
} from '@/domains/customer-management';
import {
  createColumns,
  extraMetadataKeys,
  type InstanceRow,
  instanceMetadataAccessor,
} from './instance-table-columns';

type InstancesTableProps = {
  instances: InstanceRow[];
};

export const InstancesTable = ({ instances }: InstancesTableProps) => {
  const { t } = useTranslation();
  const router = useRouter();

  // Soft-fetch the active MetadataField list. As on the DZ page, a
  // missing or 403'd response is treated as "no schema declared" so the
  // table falls back to its pre-schema raw-JSON view rather than
  // breaking the page entirely.
  const { data: metadataFieldsData } = useQuery(
    metadataFieldsActiveQueryOptions('INSTANCE'),
  );
  const metadataFields = useMemo<MetadataFieldDescriptor[]>(
    () => metadataFieldsData ?? [],
    [metadataFieldsData],
  );

  // Only surface the "Extra metadata" column when at least one instance
  // carries metadata not covered by an active field — i.e. a sign the schema
  // is incomplete. A fully-declared table stays clean.
  const showExtraMetadata = useMemo(
    () =>
      instances.some(
        (instance) =>
          extraMetadataKeys(instanceMetadataAccessor(instance), metadataFields)
            .length > 0,
      ),
    [instances, metadataFields],
  );

  const columns = useMemo(
    () => createColumns(t, metadataFields, showExtraMetadata),
    [t, metadataFields, showExtraMetadata],
  );

  const customerOptions = useMemo(() => {
    return [...new Set(instances.map((instance) => instance.customer.name))]
      .sort()
      .map((name) => ({
        label: name,
        value: name,
      }));
  }, [instances]);

  const licenseOptions = useMemo(() => {
    return [...new Set(instances.map((instance) => instance.license.name))]
      .sort()
      .map((name) => ({
        label: name,
        value: name,
      }));
  }, [instances]);
  const statusOptions = useMemo(() => getInstanceStatusFilterOptions(t), [t]);

  // Lifecycle stage is free-form, so the filter options come from the values
  // actually present in the data (defaults get translated labels, custom
  // values are shown verbatim).
  const lifecycleStageOptions = useMemo(() => {
    return [
      ...new Set(
        instances
          .map((instance) => instance.lifecycleStage)
          .filter((stage): stage is string => Boolean(stage)),
      ),
    ]
      .sort()
      .map((stage) => ({
        label: getLifecycleStageLabel(t, stage),
        value: stage,
      }));
  }, [instances, t]);

  const filterFields = useMemo<FilterFieldDefinition<InstanceRow>[]>(
    () => [
      {
        id: 'name',
        label: t('Pages.Customers.Instances.Table.Columns.name', 'Name'),
        type: 'text',
        accessor: (instance) => instance.name,
        placeholder: t('Pages.Customers.Instances.Table.Columns.name', 'Name'),
      },
      {
        id: 'description',
        label: t(
          'Pages.Customers.Instances.Table.Columns.description',
          'Description',
        ),
        type: 'text',
        accessor: (instance) => instance.description ?? '',
      },
      {
        id: 'customer',
        label: t(
          'Pages.Customers.Instances.Table.Columns.customer',
          'Customer',
        ),
        type: 'enum',
        accessor: (instance) => instance.customer.name,
        options: customerOptions,
      },
      {
        id: 'license',
        label: t('Pages.Customers.Instances.Table.Columns.license', 'License'),
        type: 'enum',
        accessor: (instance) => instance.license.name,
        options: licenseOptions,
      },
      {
        id: 'status',
        label: t('Pages.Customers.Instances.Table.Columns.status', 'Status'),
        type: 'enum',
        accessor: (instance) => instance.status,
        options: statusOptions,
      },
      {
        id: 'lifecycleStage',
        label: t(
          'Pages.Customers.Instances.Table.Columns.lifecycleStage',
          'Lifecycle',
        ),
        type: 'enum',
        accessor: (instance) => instance.lifecycleStage ?? '',
        options: lifecycleStageOptions,
      },
      ...buildFiltersFromSchema<InstanceRow>(
        metadataFields,
        instanceMetadataAccessor,
      ),
    ],
    [
      customerOptions,
      licenseOptions,
      metadataFields,
      statusOptions,
      lifecycleStageOptions,
      t,
    ],
  );

  const filterController = useFilterBuilder({
    data: instances,
    fields: filterFields,
    pinnedFilterIds: ['name'],
    debounceMs: 200,
    resetOnDataChange: true,
  });

  const getInstancePath = (instance: InstanceRow) =>
    router.buildLocation({
      to: '/customers/instances/$instanceSlug',
      params: { instanceSlug: instance.slug },
    }).pathname;

  return (
    <FilterTableLayout controller={filterController}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search filterId="name" />
          <FilterTableLayout.Actions>
            <GradientButton
              to="/customers/instances/new"
              label={t('Pages.Customers.Instances.Mutation.titleNew')}
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
          getPath={getInstancePath}
          bodyScrollable
        />
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
};
