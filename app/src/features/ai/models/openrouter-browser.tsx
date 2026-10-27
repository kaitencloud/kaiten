import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Model } from '@/api-client';
import {
  useAiNavigationContext,
  useAiAccess,
  assertAiRequestAllowed,
} from '@/domains/ai-credits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AiLoading, AiQueryError } from '../ai-section';
import {
  fetchOpenRouterCatalogue,
  openRouterSlug,
  type OpenRouterEntry,
} from './openrouter-catalogue';
import { openRouterErrorMessage, perMillionDisplay } from './openrouter-ui';

export function SourceEntryDetails({ entry }: { entry: OpenRouterEntry }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 text-sm">
      <p className="wrap-anywhere">{entry.id}</p>
      {entry.pricingStatus === 'reviewRequired' ? (
        <p role="status">{t('AI.OpenRouter.manualPricing')}</p>
      ) : (
        <p>{t('AI.OpenRouter.vendorOnly')}</p>
      )}
      <details>
        <summary className="cursor-pointer">
          {t('AI.OpenRouter.sourceDetails')}
        </summary>
        <p className="mt-2">
          {entry.issues
            .map((issue) => t(`AI.OpenRouter.issues.${issue}`))
            .join(' · ')}
        </p>
        <p>{entry.description}</p>
        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(entry.rawPrices, null, 2)}
        </pre>
      </details>
    </div>
  );
}
/** Mounted only by an explicit Import / Choose source action. */
export function OpenRouterBrowser({
  models,
  onSelect,
  checkDuplicates = true,
}: {
  models: readonly Model[];
  onSelect: (entry: OpenRouterEntry, checkedAt: string) => void;
  checkDuplicates?: boolean;
}) {
  const { t } = useTranslation();
  const context = useAiNavigationContext();
  const access = useAiAccess();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(30);
  const query = useQuery({
    queryKey: ['openrouter', 'public-catalogue'],
    enabled: access.allows('listModels'),
    queryFn: async ({ signal, client }) => {
      assertAiRequestAllowed(client);
      return {
        entries: await fetchOpenRouterCatalogue(signal),
        checkedAt: new Date().toISOString(),
      };
    },
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const needle = search.trim().toLocaleLowerCase();
  const entries = (query.data?.entries ?? []).filter((entry) =>
    [entry.id, entry.name, entry.modality ?? ''].some((value) =>
      value.toLocaleLowerCase().includes(needle),
    ),
  );
  if (!access.available) return null;
  if (query.isPending) return <AiLoading label={t('AI.OpenRouter.loading')} />;
  if (query.isError)
    return (
      <AiQueryError
        error={new Error(openRouterErrorMessage(query.error, t))}
        onRetry={() => query.refetch()}
      />
    );
  return (
    <div className="space-y-4">
      <label className="block max-w-md space-y-2">
        <span className="text-sm font-medium">{t('AI.OpenRouter.search')}</span>
        <Input
          className="min-h-11 sm:min-h-9"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(30);
          }}
        />
      </label>
      <p role="status" className="text-sm text-muted-foreground">
        {t('AI.OpenRouter.results', { count: entries.length })} ·{' '}
        {t('AI.OpenRouter.millionUnits')}
      </p>
      <ul className="divide-y rounded-lg border bg-card px-4">
        {entries.slice(0, limit).map((entry) => {
          const existing = checkDuplicates
            ? models.find((model) =>
                [model.slug, ...(model.externalIds ?? [])].some(
                  (id) => id === entry.id || id === openRouterSlug(entry.id),
                ),
              )
            : undefined;
          return (
            <li key={entry.id} className="space-y-2 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium wrap-anywhere">{entry.name}</p>
                  <p className="text-xs text-muted-foreground wrap-anywhere">
                    {entry.id} ·{' '}
                    {entry.modality
                      ? t(`AI.enums.${entry.modality}`)
                      : t('AI.OpenRouter.chooseModality')}
                  </p>
                </div>
                {existing ? (
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={
                      <Link
                        to="/catalog/models/$modelSlug/source"
                        params={{ modelSlug: existing.slug }}
                        search={context}
                      />
                    }
                  >
                    {t('AI.OpenRouter.registered')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onSelect(entry, query.data.checkedAt)}
                  >
                    {t('AI.OpenRouter.review')}
                  </Button>
                )}
              </div>
              <p className="text-sm tabular-nums">
                {entry.pricingStatus === 'fixed'
                  ? t('AI.OpenRouter.pricePair', {
                      input: perMillionDisplay(
                        entry.mappedVendorCosts.perInputToken,
                      ),
                      output: perMillionDisplay(
                        entry.mappedVendorCosts.perOutputToken,
                      ),
                    })
                  : t('AI.OpenRouter.reviewPricing')}
              </p>
            </li>
          );
        })}
      </ul>
      {!entries.length ? <p>{t('AI.Models.noMatches')}</p> : null}
      {entries.length > limit ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setLimit((value) => value + 30)}
        >
          {t('AI.OpenRouter.showMore')}
        </Button>
      ) : null}
    </div>
  );
}
