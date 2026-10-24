import {
  aiMatrixQueryKey,
  aiWildcardImpactQueryKey,
} from '@/domains/ai-credits';
export { modelsQueryOptions, invalidateAiQueries } from '@/domains/ai-credits';
import { queryOptions } from '@tanstack/react-query';
import { listConversionRules } from '@/api-client';
import type { AiMatrixQuery } from '@/api-client/graphql/graphql';
import { allLicensesOptions } from '@/lib/api/all-pages-query-options';
import { graphqlClient } from '@/lib/graphql-client';
import { AI_MATRIX } from './ai.queries';

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
