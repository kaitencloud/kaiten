import { Badge } from '@/components/ui/badge';
import { useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IntegrationSyncBadge } from '@/domains/crm-sync';
import { GradientButton } from '@/components/gradient-button';
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
  dataTableSortableHeader,
  FilterTableLayout,
} from '@/functionals/table';
import { capitalizeFromUpperCase } from '@/lib/utils';
import type { Customer } from '../types';
import { CustomerInstancesDisplay } from './customer-instances-display';
import { CustomerTableActions } from './customer-table-actions';

type CustomersTableProps = {
  customers: Customer[];
};

function CustomerLicenseTypesCell({
  licenseTypes,
}: {
  licenseTypes: Customer['licenseTypes'];
}) {
  const { t } = useTranslation();

  if (licenseTypes.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {licenseTypes.map((licenseType) => (
        <Badge key={licenseType} variant="outline" className="text-xs">
          {t(
            `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(licenseType)}`,
          )}
        </Badge>
      ))}
    </div>
  );
}

export const CustomersTable = ({ customers }: CustomersTableProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: 'name',
        header: dataTableSortableHeader(
          t('Pages.Customers.Table.Columns.name'),
        ),
      },
      {
        accessorKey: 'externalCustomerId',
        enableSorting: false,
        header: t('Pages.Customers.Table.Columns.externalId', 'External ID'),
        cell: ({ row }) =>
          row.original.externalCustomerId ? (
            <span
              className="block max-w-56 truncate font-mono text-xs"
              title={row.original.externalCustomerId}
            >
              {row.original.externalCustomerId}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: 'domain',
        enableSorting: false,
        header: t('Pages.Customers.Table.Columns.domain', 'Domain'),
        cell: ({ row }) =>
          row.original.domain ? (
            <span className="font-mono text-xs">{row.original.domain}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: 'crmSync',
        enableSorting: false,
        header: t('Pages.Customers.Table.Columns.crmSync', 'CRM Sync'),
        cell: ({ row }) => (
          <IntegrationSyncBadge
            entityKind="customer"
            entitySlug={row.original.slug}
            integrations={row.original.integrations}
          />
        ),
      },
      {
        id: 'licenseTypes',
        enableSorting: false,
        header: t('Pages.Customers.Table.Columns.licenseType'),
        cell: ({ row }) => (
          <CustomerLicenseTypesCell licenseTypes={row.original.licenseTypes} />
        ),
      },
      {
        id: 'nbInstances',
        accessorKey: 'nbInstances',
        enableSorting: false,
        header: t('Pages.Customers.Table.Columns.instances', 'Instances'),
        cell: ({ row }) => (
          <CustomerInstancesDisplay instances={row.original.instances} />
        ),
      },
      createActionsColumn<Customer>((customer: Customer) => (
        <CustomerTableActions customer={customer} />
      )),
    ],
    [t],
  );
  const licenseTypeOptions = useMemo(() => {
    return [...new Set(customers.flatMap((customer) => customer.licenseTypes))]
      .sort()
      .map((licenseType) => ({
        label: t(
          `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(licenseType)}`,
        ),
        value: licenseType,
      }));
  }, [customers, t]);

  const filterFields = useMemo<FilterFieldDefinition<Customer>[]>(
    () => [
      {
        id: 'name',
        label: t('Pages.Customers.Table.Columns.name'),
        type: 'text',
        accessor: (customer) => customer.name,
        placeholder: t('Pages.Customers.Table.Columns.name'),
      },
      {
        id: 'externalCustomerId',
        label: t('Pages.Customers.Table.Columns.externalId', 'External ID'),
        type: 'text',
        accessor: (customer) => customer.externalCustomerId ?? '',
      },
      {
        id: 'domain',
        label: t('Pages.Customers.Table.Columns.domain', 'Domain'),
        type: 'text',
        accessor: (customer) => customer.domain ?? '',
      },
      {
        id: 'licenseTypes',
        label: t('Pages.Customers.Table.Columns.licenseType'),
        type: 'enum',
        accessor: (customer) => customer.licenseTypes,
        options: licenseTypeOptions,
      },
    ],
    [licenseTypeOptions, t],
  );

  const filterController = useFilterBuilder({
    data: customers,
    fields: filterFields,
    pinnedFilterIds: ['name'],
    debounceMs: 200,
    resetOnDataChange: true,
  });

  const getCustomerPath = (customer: Customer) =>
    router.buildLocation({
      to: '/customers/$customerSlug',
      params: { customerSlug: customer.slug },
    }).pathname;

  return (
    <FilterTableLayout controller={filterController}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search filterId="name" />
          <FilterTableLayout.Actions>
            <GradientButton
              to="/customers/new"
              label={t('Pages.Customers.Mutation.titleNew')}
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
          getPath={getCustomerPath}
          bodyScrollable
        />
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
};
