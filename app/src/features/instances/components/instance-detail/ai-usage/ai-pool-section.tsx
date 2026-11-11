import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntitlementUsage } from '@/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getApiErrorMessage } from '@/lib/errors';
import { useCatalogue } from './use-catalogue';
import { AiInferenceFilters } from './ai-inference-filters';
import { AiInferenceTable } from './ai-inference-table';
import { AiPoolHeader } from './ai-pool-header';
import { AiReservationsTable, useReservations } from './ai-reservations-table';
import {
  activeFilterCount,
  filtersFromSearch,
  modelFilterOptions,
} from './inference-filters';
import { creditBalance } from './pool-balance';
import { ChargeReceiptSheet } from './receipt/charge-receipt-sheet';
import { useAiUsageSearch } from './use-ai-usage-search';
import { useInferenceFeed } from './use-inference-feed';

type AiPoolSectionProps = {
  instanceSlug: string;
  usage: EntitlementUsage;
  name: string;
  /** The pool's early-warning threshold, from the entitlement. */
  warningThresholdPercent?: number | null;
};

/**
 * One AI credit pool of an instance: its balance and projection, its open
 * holds, the inference feed with its filters, and the receipt of the row the
 * URL names.
 */
export function AiPoolSection({
  instanceSlug,
  usage,
  name,
  warningThresholdPercent,
}: AiPoolSectionProps) {
  const { t } = useTranslation();
  const errorId = useId();
  const { search, update, clearFilters } = useAiUsageSearch();
  const path = { instanceSlug, entitlementSlug: usage.entitlementSlug };
  const reservations = useReservations(path);
  const models = useCatalogue();
  const filters = filtersFromSearch(search);
  const { feed, invalidRange, rows } = useInferenceFeed(path, filters);
  const filterCount = activeFilterCount(filters);
  const balance = creditBalance(usage);
  const modelOptions = modelFilterOptions(
    models.data?.items ?? [],
    rows,
    search.model,
  );

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <AiPoolHeader
        name={name}
        usage={usage}
        warningThresholdPercent={warningThresholdPercent}
        holds={reservations.data?.items?.length}
      />
      <div className="space-y-6 px-4 py-5 sm:px-6">
        <AiReservationsTable
          reservations={reservations}
          reserved={usage.reserved}
        />
        <section aria-labelledby={`${errorId}-feed`} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <h3 id={`${errorId}-feed`} className="text-sm font-semibold">
                {t('AI.Usage.feed')}
              </h3>
              {feed.data ? (
                <p className="text-xs text-muted-foreground">
                  {t('AI.Usage.loaded', { count: rows.length })}
                </p>
              ) : null}
            </div>
            {filterCount ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                {t('AI.Usage.clearFilters')}
              </Button>
            ) : null}
          </div>
          <AiInferenceFilters
            search={search}
            models={modelOptions}
            invalidRange={invalidRange}
            errorId={errorId}
            onChange={update}
          />
          {invalidRange ? (
            <p
              id={errorId}
              role="alert"
              className="rounded-lg bg-destructive-subtle p-3 text-sm text-destructive-subtle-foreground"
            >
              {t('AI.Errors.invalidRange')}
            </p>
          ) : feed.isError ? (
            <p
              role="alert"
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              {getApiErrorMessage(feed.error)}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void feed.refetch()}
              >
                {t('Common.retry')}
              </Button>
            </p>
          ) : feed.isPending ? (
            <div role="status" className="space-y-2">
              <span className="sr-only">{t('AI.Usage.loadingInferences')}</span>
              <Skeleton className="h-10 w-full motion-reduce:animate-none" />
              <Skeleton className="h-10 w-full motion-reduce:animate-none" />
            </div>
          ) : (
            <AiInferenceTable
              rows={rows}
              models={models.data?.items}
              emptyMessage={t(
                filterCount ? 'AI.Usage.noMatches' : 'AI.Usage.noInferences',
              )}
              onOpenReceipt={(receipt) => update({ receipt }, { push: true })}
            />
          )}
          {feed.hasNextPage && !invalidRange ? (
            <Button
              variant="outline"
              size="sm"
              disabled={feed.isFetchingNextPage}
              onClick={() => void feed.fetchNextPage()}
            >
              {t(
                feed.isFetchingNextPage
                  ? 'AI.Usage.loadingInferences'
                  : 'AI.Usage.more',
              )}
            </Button>
          ) : null}
        </section>
      </div>
      {search.receipt ? (
        <ChargeReceiptSheet
          instanceSlug={instanceSlug}
          transactionId={search.receipt}
          pool={{
            slug: usage.entitlementSlug,
            name,
            licenseSlug: usage.licenseSlug || null,
            limit: balance.allowance < 0 ? null : balance.allowance,
            maximum: balance.maximum,
          }}
          onClose={() => update({ receipt: undefined })}
        />
      ) : null}
    </section>
  );
}
