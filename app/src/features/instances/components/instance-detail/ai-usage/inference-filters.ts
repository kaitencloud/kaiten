import type { AiInference, ListAiInferencesData, Model } from '@/api-client';
import { dateTimeInputToInstant } from '@/lib/date-time-input';
import type { AiUsageSearch } from './ai-usage-search';

/**
 * The feed's filters. Every one of them is a query parameter of
 * `listAiInferences`: the API filters, the feed shows what it answers, and
 * "Load older inferences" walks the filtered history.
 */
export type InferenceFilters = {
  status?: AiInference['status'];
  transactionId?: string;
  from?: string;
  to?: string;
  model?: string;
  requestType?: AiInference['requestType'];
  authorized?: boolean;
};

export function filtersFromSearch(search: AiUsageSearch): InferenceFilters {
  return {
    authorized: search.auth === undefined ? undefined : search.auth === 'yes',
    from: search.from,
    model: search.model,
    requestType: search.type,
    status: search.status,
    to: search.to,
    transactionId: search.tx,
  };
}

export type InferenceQuery = NonNullable<ListAiInferencesData['query']>;

/** What the API is asked for; the cursor and page size are added by the feed. */
export function serverQuery(filters: InferenceFilters): InferenceQuery {
  return {
    // A reservation is neither authorized nor refused: the API leaves it out
    // of both answers.
    authorized:
      filters.authorized === undefined
        ? undefined
        : filters.authorized
          ? 'true'
          : 'false',
    from: (filters.from && dateTimeInputToInstant(filters.from)) || undefined,
    // The model exactly as the integration sent it, which also finds a model
    // the catalogue does not know.
    model: filters.model,
    requestType: filters.requestType,
    status: filters.status,
    to: (filters.to && dateTimeInputToInstant(filters.to)) || undefined,
    transactionId: filters.transactionId,
  };
}

/** The range is refused by the API when `from` is not before `to`. */
export function isInvalidRange(query: InferenceQuery) {
  return Boolean(query.from && query.to && query.from >= query.to);
}

export function activeFilterCount(filters: InferenceFilters) {
  return Object.values(filters).filter((value) => value !== undefined).length;
}

/**
 * What the "Model as sent" filter offers: the names an integration can send for
 * a catalogue model (its slug and its external ids), the names seen in the
 * loaded rows (a model the catalogue does not know is only found there), and
 * the one the URL holds. The list does not shrink when the filter is applied.
 */
export function modelFilterOptions(
  models: readonly Pick<Model, 'externalIds' | 'slug'>[],
  loaded: readonly Pick<AiInference, 'model'>[],
  current: string | undefined,
): string[] {
  const names = [
    ...models.flatMap((model) => [model.slug, ...(model.externalIds ?? [])]),
    ...loaded.map((row) => row.model),
    current,
  ].filter((name): name is string => Boolean(name));

  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
