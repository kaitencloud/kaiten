import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type ColumnDef, TableLinkedItemsDialog } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { ReleaseManagementOverviewComponent } from '../../../types';

export function ReleaseComponentsDisplay({
  components,
}: {
  components: ReleaseManagementOverviewComponent[];
}) {
  const { t } = useTranslation();
  const columns = useMemo<
    ColumnDef<ReleaseManagementOverviewComponent>[]
  >(() => {
    const ComponentIcon = dataModelIcons.component;
    return [
      {
        accessorKey: 'name',
        header: t('Pages.Releases.Components.Table.Columns.name'),
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ComponentIcon className="size-4 text-primary-subtle-foreground" />
              <span className="font-medium">{row.original.name}</span>
            </div>
            {row.original.description ? (
              <p className="text-sm text-muted-foreground">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'version',
        header: t('Pages.Releases.Components.Table.Columns.version'),
      },
    ];
  }, [t]);

  if (components.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <TableLinkedItemsDialog
      columns={columns}
      data={components}
      title={t('Pages.Releases.Releases.Dialogs.componentsTitle')}
      description={t('Pages.Releases.Releases.Dialogs.componentsDescription')}
      triggerLabel={t('Pages.Releases.Releases.Table.componentCount', {
        count: components.length,
      })}
    />
  );
}
