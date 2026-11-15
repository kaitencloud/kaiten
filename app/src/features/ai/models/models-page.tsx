import { useAiNavigationContext, useAiAccess } from '@/domains/ai-credits';
import { useId, useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Model } from '@/api-client';
import { deleteModelMutation } from '@/api-client/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DeleteConfirmationDialog } from '@/components/dialog';
import { Page } from '@/functionals/page';
import { TableCard, type ColumnDef } from '@/functionals/table';
import { getApiErrorMessage } from '@/lib/errors';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  modelsQueryOptions,
  invalidateAiQueries,
} from '../queries/ai-query-options';
import { AiLoading, AiQueryError } from '../ai-section';

function ModelActions({ model }: { model: Model }) {
  const context = useAiNavigationContext();
  const access = useAiAccess();
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
  if (!access.allows('getModel')) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={
          <Link
            to="/catalog/models/$modelSlug/source"
            params={{ modelSlug: model.slug }}
            search={context}
          />
        }
      >
        {t('AI.OpenRouter.sourcePricing')}
      </Button>
      <Button
        disabled={!access.allows('updateModel')}
        nativeButton={false}
        variant="outline"
        size="sm"
        className="min-h-11 sm:min-h-8"
        render={
          <Link
            search={context}
            to="/catalog/models/$modelSlug/edit"
            params={{ modelSlug: model.slug }}
          />
        }
      >
        {t('Common.edit')}
      </Button>
      <DeleteConfirmationDialog
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 text-destructive-subtle-foreground sm:min-h-8"
            disabled={remove.isPending || !access.allows('deleteModel')}
          >
            {t('Common.delete')}
          </Button>
        }
        title={t('Common.confirmDeleteTitle')}
        description={t('Common.confirmDeleteDescription', { name: model.name })}
        cancelLabel={t('Common.cancel')}
        confirmLabel={t('Common.confirm')}
        confirmDisabled={remove.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function ModelIdentity({ model }: { model: Model }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium wrap-anywhere">{model.name}</p>
      <p className="text-xs text-muted-foreground wrap-anywhere">
        {model.slug}
      </p>
    </div>
  );
}
function ModelProvider({ model }: { model: Model }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <p>{model.vendor}</p>
      <p className="text-xs text-muted-foreground">
        {t(`AI.enums.${model.modality}`)}
      </p>
    </div>
  );
}
function ModelStatus({ model }: { model: Model }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex rounded border bg-muted px-2 py-1 text-xs whitespace-nowrap">
      {t(`AI.enums.${model.status}`)}
    </span>
  );
}
function ModelCard({ model }: { model: Model }) {
  return (
    <li className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ModelIdentity model={model} />
        <ModelStatus model={model} />
      </div>
      <ModelProvider model={model} />
      <ModelActions model={model} />
    </li>
  );
}

export function ModelsPage() {
  const context = useAiNavigationContext();
  const access = useAiAccess();
  const { t } = useTranslation();
  const query = useQuery({
    ...modelsQueryOptions,
    enabled: access.allows('listModels'),
  });
  const [search, setSearch] = useState('');
  const searchId = useId();
  const ModelIcon = dataModelIcons.model;
  const needle = search.trim().toLocaleLowerCase();
  const models = (query.data?.items ?? []).filter((model) =>
    [
      model.name,
      model.slug,
      model.vendor,
      t(`AI.enums.${model.modality}`),
      t(`AI.enums.${model.status}`),
    ].some((value) => value.toLocaleLowerCase().includes(needle)),
  );
  const columns: ColumnDef<Model>[] = [
    {
      id: 'identity',
      header: t('AI.Models.identity'),
      cell: ({ row }) => <ModelIdentity model={row.original} />,
    },
    {
      id: 'provider',
      header: t('AI.Models.provider'),
      cell: ({ row }) => <ModelProvider model={row.original} />,
    },
    {
      id: 'status',
      header: t('AI.status'),
      cell: ({ row }) => <ModelStatus model={row.original} />,
    },
    {
      id: 'actions',
      header: t('Common.actions'),
      cell: ({ row }) => <ModelActions model={row.original} />,
    },
  ];
  function renderModel(model: Model) {
    return <ModelCard key={model.slug} model={model} />;
  }
  if (!access.available) return null;
  return (
    <Page>
      <Page.Header>
        <Page.Leading>
          <ModelIcon />
          <Page.Title>{t('AI.Models.title')}</Page.Title>
        </Page.Leading>
        <Page.Actions>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link to="/ai/matrix" search={context} />}
          >
            {t('AI.Matrix.title')}
          </Button>
          <Button
            disabled={!access.allows('createModel')}
            variant="outline"
            nativeButton={false}
            render={<Link to="/catalog/models/new" search={context} />}
          >
            {t('AI.Models.create')}
          </Button>
          <Button
            disabled={
              !access.allows('createModel') || !access.allows('listModels')
            }
            nativeButton={false}
            render={<Link to="/catalog/models/import" search={context} />}
          >
            {t('AI.OpenRouter.importTitle')}
          </Button>
        </Page.Actions>
      </Page.Header>
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          {t('AI.Models.description')}
        </p>
        <div className="max-w-md space-y-2">
          <Label htmlFor={searchId}>{t('AI.Models.search')}</Label>
          <Input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('AI.Models.searchPlaceholder')}
            className="min-h-11 sm:min-h-9"
          />
        </div>
        {query.isPending ? (
          <AiLoading label={t('AI.Models.loading')} />
        ) : query.isError ? (
          <AiQueryError error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              {t('AI.Models.count', {
                count: models.length,
                total: query.data.items.length,
              })}
            </p>
            <div className="hidden sm:block">
              <TableCard className="shadow-none">
                <TableCard.Table
                  data={models}
                  columns={columns}
                  emptyMessage={t(
                    needle ? 'AI.Models.noMatches' : 'AI.Models.empty',
                  )}
                />
              </TableCard>
            </div>
            <ul
              aria-label={t('AI.Models.title')}
              className="space-y-3 sm:hidden"
            >
              {models.length ? (
                models.map(renderModel)
              ) : (
                <li className="rounded-lg border p-4 text-sm">
                  {t(needle ? 'AI.Models.noMatches' : 'AI.Models.empty')}
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </Page>
  );
}
