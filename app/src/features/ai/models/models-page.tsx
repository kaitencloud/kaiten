import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Model } from '@/api-client';
import { deleteModelMutation } from '@/api-client/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { DestructiveActionButton } from '@/components/destructive-action-button';
import { Page } from '@/functionals/page';
import { TableCard, type ColumnDef } from '@/functionals/table';
import { getApiErrorMessage } from '@/lib/errors';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  modelsQueryOptions,
  invalidateAiQueries,
} from '../queries/ai-query-options';

function ModelActions({ model }: { model: Model }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const remove = useMutation(deleteModelMutation());
  async function handleDelete() {
    try {
      await remove.mutateAsync({ path: { modelSlug: model.slug } });
      await invalidateAiQueries(client);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        render={
          <Link
            to="/ai/models/$modelSlug/edit"
            params={{ modelSlug: model.slug }}
          />
        }
      >
        {t('Common.edit')}
      </Button>
      <DestructiveActionButton
        label={t('Common.delete')}
        title={t('Common.confirmDeleteTitle')}
        description={t('Common.confirmDeleteDescription', { name: model.name })}
        cancelLabel={t('Common.cancel')}
        confirmLabel={t('Common.confirm')}
        onConfirm={handleDelete}
        disabled={remove.isPending}
      />
    </div>
  );
}
export function ModelsPage() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(modelsQueryOptions);
  const ModelIcon = dataModelIcons.model;
  const columns: ColumnDef<Model>[] = [
    { accessorKey: 'name', header: t('AI.name') },
    { accessorKey: 'slug', header: t('AI.slug') },
    { accessorKey: 'vendor', header: t('AI.vendor') },
    { accessorKey: 'modality', header: t('AI.modality') },
    { accessorKey: 'status', header: t('AI.status') },
    {
      id: 'actions',
      header: t('Common.actions'),
      cell: ({ row }) => <ModelActions model={row.original} />,
    },
  ];
  return (
    <Page>
      <Page.Header>
        <Page.Leading>
          <ModelIcon />
          <Page.Title>{t('AI.Models.title')}</Page.Title>
        </Page.Leading>
        <Page.Actions>
          <Button render={<Link to="/ai/matrix" />}>
            {t('AI.Matrix.title')}
          </Button>
          <Button render={<Link to="/ai/models/new" />}>
            {t('Common.create')}
          </Button>
        </Page.Actions>
      </Page.Header>
      <TableCard>
        <TableCard.Table
          data={data.items}
          columns={columns}
          emptyMessage={t('Common.noResults')}
        />
      </TableCard>
    </Page>
  );
}
