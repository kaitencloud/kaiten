import { Button } from '@/components/ui/button';
import type { TFunction } from 'i18next';
import { Plus } from 'lucide-react';
import type { Component } from '@/api-client';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { useReleaseForm } from '../../hooks/use-release-form';
import type { ReleaseFormValues } from '../../schemas/release.schema';
import type { ReleaseManagementOverviewRelease } from '../../types';
import {
  type ComponentRow,
  useComponentColumns,
} from './release-form-components-columns';
import { useReleaseFormComponentsCard } from './use-release-form-components-card';

type ReleaseFormComponentsCardProps = {
  availableComponents: Component[];
  form: ReturnType<typeof useReleaseForm>['form'];
  onOpenAddCatalogDialog: () => void;
  onOpenCreateDialog: () => void;
  onOpenEditComponent: (row: ComponentRow) => void;
  previousRelease: ReleaseManagementOverviewRelease | undefined;
  t: TFunction;
  values: ReleaseFormValues;
};

export function ReleaseFormComponentsCard({
  availableComponents,
  form,
  onOpenAddCatalogDialog,
  onOpenCreateDialog,
  onOpenEditComponent,
  previousRelease,
  t,
  values,
}: ReleaseFormComponentsCardProps) {
  const ComponentIcon = dataModelIcons.component;
  const { handleDelete, rows } = useReleaseFormComponentsCard({
    availableComponents,
    form,
    previousRelease,
    values,
  });

  const columns = useComponentColumns({
    onDelete: handleDelete,
    onEdit: onOpenEditComponent,
    t,
  });

  return (
    <TableCard>
      <TableCard.Header className="flex items-start justify-between gap-4">
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <ComponentIcon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>
              {t('Pages.Releases.Deployments.Form.componentsCard.title')}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t('Pages.Releases.Deployments.Form.componentsCard.description')}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
        <TableCard.HeaderActions>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onOpenAddCatalogDialog}
          >
            <Plus className="size-4" />
            {t('Pages.Releases.Deployments.Form.componentsCard.addFromCatalog')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={onOpenCreateDialog}
          >
            <Plus className="size-4" />
            {t('Pages.Releases.Deployments.Form.componentsCard.createNew')}
          </Button>
        </TableCard.HeaderActions>
      </TableCard.Header>

      <TableCard.Table
        columns={columns}
        data={rows}
        variant="simple"
        emptyMessage={t(
          'Pages.Releases.Deployments.Form.componentsCard.emptyMessage',
        )}
        getRowClassName={(row) =>
          row.status === 'removed' ? 'opacity-50' : undefined
        }
      />
    </TableCard>
  );
}
