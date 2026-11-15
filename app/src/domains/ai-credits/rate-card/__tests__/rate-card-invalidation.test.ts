import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vite-plus/test';
import {
  getModelQueryKey,
  listConversionRulesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { invalidateAiQueries, modelsQueryOptions } from '../../ai-query-options';
import { aiRateCardQueryKey } from '../rate-card-query';

const invalidated = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

describe('invalidateAiQueries', () => {
  it('refreshes the rate card with the REST reads of rules and models', async () => {
    const client = new QueryClient();
    const keys = [
      aiRateCardQueryKey,
      modelsQueryOptions.queryKey,
      getModelQueryKey({ path: { modelSlug: 'claude-sonnet-4-5' } }),
      listConversionRulesQueryKey({ path: { licenseSlug: 'enterprise-v2' } }),
    ];
    for (const key of keys) {
      client.setQueryData(key, { seeded: true });
    }
    client.setQueryData(['somewhere', 'else'], { seeded: true });

    await invalidateAiQueries(client);

    for (const key of keys) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    expect(invalidated(client, ['somewhere', 'else'])).toBe(false);
  });

  it('keeps the rate card under a key of its own', () => {
    expect(aiRateCardQueryKey).toEqual(['ai', 'rate-card']);
  });
});
