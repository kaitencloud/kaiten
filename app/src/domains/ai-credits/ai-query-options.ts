import type { QueryClient } from '@tanstack/react-query';
import { listModels } from '@/api-client';
import {
  listModelsOptions,
  getModelQueryKey,
  listConversionRulesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';
import { aiRateCardQueryKey } from './rate-card/rate-card-query';

export const modelsQueryOptions = {
  ...listModelsOptions(),
  queryFn: async ({ signal }: { signal: AbortSignal }) => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) =>
        (
          await listModels({
            query: { cursor, limit: MAX_PAGE_SIZE },
            signal,
            throwOnError: true,
          })
        ).data,
      signal,
    ),
  }),
};
export async function invalidateAiQueries(client: QueryClient) {
  const [{ _id }] = getModelQueryKey({ path: { modelSlug: '' } });
  const [ruleKey] = listConversionRulesQueryKey({ path: { licenseSlug: '' } });
  await Promise.all([
    client.invalidateQueries({ queryKey: modelsQueryOptions.queryKey }),
    client.invalidateQueries({ queryKey: [{ _id }] }),
    client.invalidateQueries({ queryKey: [{ _id: ruleKey._id }] }),
    client.invalidateQueries({ queryKey: aiRateCardQueryKey }),
  ]);
}
