import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type ColumnDef, TableLinkedItemsDialog } from '@/functionals/table';
import { capitalizeFromUpperCase } from '@/lib/utils';
import type { Customer } from '../types';

type CustomerInstanceRow = Customer['instances'][number];

type CustomerInstancesDisplayProps = {
  instances: CustomerInstanceRow[];
};

export function CustomerInstancesDisplay({
  instances,
}: CustomerInstancesDisplayProps) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<CustomerInstanceRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('Pages.Customers.Table.Dialogs.Columns.instance'),
        cell: ({ row }) => (
          <div className="space-y-1">
            <span className="font-medium">{row.original.name}</span>
            {row.original.description ? (
              <p className="text-sm text-muted-foreground">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'licenseType',
        header: t('Pages.Customers.Table.Dialogs.Columns.licenseType'),
        cell: ({ row }) =>
          t(
            `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(row.original.license.type)}`,
          ),
      },
    ],
    [t],
  );

  if (instances.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <TableLinkedItemsDialog
      columns={columns}
      data={instances}
      title={t('Pages.Customers.Table.Dialogs.instancesTitle')}
      description={t('Pages.Customers.Table.Dialogs.instancesDescription')}
      triggerLabel={t('Pages.Customers.Table.instanceCount', {
        count: instances.length,
      })}
    />
  );
}
