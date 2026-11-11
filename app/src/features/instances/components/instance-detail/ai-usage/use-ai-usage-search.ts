import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback } from 'react';
import {
  type AiUsageSearch,
  FILTER_KEYS,
  readAiUsageSearch,
} from './ai-usage-search';

/**
 * The tab's state in the URL: read through `aiUsageSearchSchema`, as the route
 * validates it, and written by replacing only the keys given, so the rest of
 * the search (and any other tab's) is kept. Filter changes replace the history
 * entry; opening a receipt pushes one, so Back closes it.
 */
export function useAiUsageSearch() {
  const raw = useSearch({ strict: false });
  const navigate = useNavigate({
    from: '/customers/instances/$instanceSlug/ai-usage',
  });
  const search = readAiUsageSearch(raw);
  const update = useCallback(
    (patch: Partial<AiUsageSearch>, options: { push?: boolean } = {}) =>
      void navigate({
        replace: !options.push,
        resetScroll: false,
        search: (previous) => ({ ...previous, ...patch }),
        to: '.',
      }),
    [navigate],
  );
  const clearFilters = useCallback(
    () =>
      update(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined]))),
    [update],
  );

  return { search, update, clearFilters };
}
