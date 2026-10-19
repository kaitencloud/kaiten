import {
  aiMatrixQueryKey,
  aiWildcardImpactQueryKey,
} from '@/domains/ai-credits';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { listModels, listConversionRules } from '@/api-client';
import {
  listModelsOptions,
  getModelQueryKey,
  listConversionRulesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import type { AiMatrixQuery } from '@/api-client/graphql/graphql';
import { allLicensesOptions } from '@/lib/api/all-pages-query-options';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';
import { graphqlClient } from '@/lib/graphql-client';
import { AI_MATRIX } from './ai.queries';

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
export const matrixQueryKey = aiMatrixQueryKey;
export const matrixQueryOptions = (familySlug: string) =>
  queryOptions({
    queryKey: [...matrixQueryKey, familySlug],
    queryFn: ({ signal }) =>
      graphqlClient.request<AiMatrixQuery>(
        AI_MATRIX.toString(),
        { familySlug },
        signal,
      ),
  });
export const wildcardQueryOptions = queryOptions({
  queryKey: aiWildcardImpactQueryKey,
  queryFn: async ({ signal }) => {
    const licenses = await allLicensesOptions().queryFn({ signal });
    const rows: { licenseSlug: string; entitlementSlug: string }[] = [];
    for (const license of licenses.items) {
      if (!license.slug) continue;
      const { data } = await listConversionRules({
        path: { licenseSlug: license.slug },
        signal,
        throwOnError: true,
      });
      for (const rule of data ?? [])
        if (rule.modelSlug === null)
          rows.push({
            licenseSlug: license.slug,
            entitlementSlug: rule.entitlementSlug,
          });
    }
    return rows;
  },
});
export async function invalidateAiQueries(client: QueryClient) {
  const [{ _id }] = getModelQueryKey({ path: { modelSlug: '' } });
  const [ruleKey] = listConversionRulesQueryKey({ path: { licenseSlug: '' } });
  await Promise.all([
    client.invalidateQueries({ queryKey: modelsQueryOptions.queryKey }),
    client.invalidateQueries({ queryKey: [{ _id }] }),
    client.invalidateQueries({ queryKey: [{ _id: ruleKey._id }] }),
    client.invalidateQueries({ queryKey: matrixQueryKey }),
    client.invalidateQueries({ queryKey: wildcardQueryOptions.queryKey }),
  ]);
}
