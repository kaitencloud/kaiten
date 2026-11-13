import {
  AiLoading,
  AiQueryError,
  aiRateCardQueryOptions,
  modelsQueryOptions,
  useAiAccess,
  useAiNavigationContext,
} from '@/domains/ai-credits';
import { useCallback, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Page } from '@/functionals/page';
import { TableCard, type ColumnDef } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  ModelActions,
  ModelIdentity,
  ModelProvider,
  ModelRulesCount,
  ModelStatus,
  ModelVendorCost,
} from './model-cells';
import {
  filterModels,
  MODEL_STATUS_FILTERS,
  type ModelStatusFilter,
  ruleCountsByModel,
} from './model-list-model';

function ModelCard({
  model,
  rulesCount,
}: {
  model: Model;
  rulesCount: number | undefined;
}) {
  const { t } = useTranslation();
  return (
    <li className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ModelIdentity model={model} />
        <ModelStatus model={model} />
      </div>
      <ModelProvider model={model} />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">
            {t('AI.Models.vendorCost')}
          </dt>
          <dd>
            <ModelVendorCost model={model} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {t('AI.Models.rules')}
          </dt>
          <dd>
            <ModelRulesCount count={rulesCount} model={model} />
          </dd>
        </div>
      </dl>
      <ModelActions model={model} rulesCount={rulesCount} />
    </li>
  );
}

/** The status filter: every status, or one. */
function StatusFilter({
  value,
  onChange,
}: {
  value: ModelStatusFilter;
  onChange: (status: ModelStatusFilter) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const items = MODEL_STATUS_FILTERS.map((status) => ({
    value: status,
    label:
      status === 'all' ? t('AI.Models.allStatuses') : t(`AI.enums.${status}`),
  }));

  return (
    <div className="w-full space-y-2 sm:w-48">
      <Label htmlFor={id}>{t('AI.status')}</Label>
      <Select
        items={items}
        value={value}
        onValueChange={(next) =>
          next !== null && onChange(next as ModelStatusFilter)
        }
      >
        <SelectTrigger id={id} className="min-h-11 w-full sm:min-h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{items.map(renderStatus)}</SelectContent>
      </Select>
    </div>
  );
}

function renderStatus(item: { value: string; label: string }) {
  return (
    <SelectItem key={item.value} value={item.value}>
      {item.label}
    </SelectItem>
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
  // The rules that name each model come from the rate card, read where the
  // session may read it: the count is a dash, not a zero, where it may not.
  const rateCard = useQuery({
    ...aiRateCardQueryOptions,
    enabled:
      access.allows('getLicenses') && access.allows('listConversionRules'),
  });
  const ruleCounts = useMemo(
    () => (rateCard.data ? ruleCountsByModel(rateCard.data) : null),
    [rateCard.data],
  );
  const rulesOf = useCallback(
    (model: Model) =>
      ruleCounts ? (ruleCounts.get(model.slug) ?? 0) : undefined,
    [ruleCounts],
  );
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ModelStatusFilter>('all');
  const searchId = useId();
  const ModelIcon = dataModelIcons.model;
  const filtered = search.trim() !== '' || status !== 'all';
  const models = filterModels(query.data?.items ?? [], {
    labels: (model) => [
      t(`AI.enums.${model.modality}`),
      t(`AI.enums.${model.status}`),
    ],
    search,
    status,
  });
  const columns: ColumnDef<Model>[] = useMemo(
    () => [
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
        id: 'vendorCost',
        header: t('AI.Models.vendorCost'),
        cell: ({ row }) => <ModelVendorCost model={row.original} />,
      },
      {
        id: 'rules',
        header: t('AI.Models.rules'),
        cell: ({ row }) => (
          <ModelRulesCount count={rulesOf(row.original)} model={row.original} />
        ),
      },
      {
        id: 'actions',
        header: t('Common.actions'),
        cell: ({ row }) => (
          <ModelActions
            model={row.original}
            rulesCount={rulesOf(row.original)}
          />
        ),
      },
    ],
    [t, rulesOf],
  );
  function renderModel(model: Model) {
    return (
      <ModelCard key={model.slug} model={model} rulesCount={rulesOf(model)} />
    );
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
            render={
              <Link
                to="/ai/pricing"
                search={{
                  pool: context.entitlementSlug,
                  version: context.licenseSlug,
                }}
              />
            }
          >
            {t('AI.Nav.pricing')}
          </Button>
          <Button
            disabled={!access.allows('createModel')}
            variant="outline"
            nativeButton={false}
            render={<Link to="/ai/models/new" search={context} />}
          >
            {t('AI.Models.create')}
          </Button>
          <Button
            disabled={
              !access.allows('createModel') || !access.allows('listModels')
            }
            nativeButton={false}
            render={<Link to="/ai/models/import" search={context} />}
          >
            {t('AI.OpenRouter.importTitle')}
          </Button>
        </Page.Actions>
      </Page.Header>
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          {t('AI.Models.description')}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-md space-y-2">
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
          <StatusFilter value={status} onChange={setStatus} />
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
                    filtered ? 'AI.Models.noMatches' : 'AI.Models.empty',
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
                  {t(filtered ? 'AI.Models.noMatches' : 'AI.Models.empty')}
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </Page>
  );
}
