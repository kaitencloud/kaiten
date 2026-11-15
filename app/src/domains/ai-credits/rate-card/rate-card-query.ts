import { queryOptions } from '@tanstack/react-query';
import type { AiRateCardQuery } from '@/api-client/graphql/graphql';
import { fetchAllPages } from '@/lib/api/pagination';
import { graphqlClient, GraphQLRequestError } from '@/lib/graphql-client';
import { assertAiRequestAllowed, revokeAiAccess } from '../ai-request-guard';
import { AI_RATE_CARD } from './rate-card.queries';

export type RateCardLicense = AiRateCardQuery['licenses']['items'][number];
export type RateCardRule = RateCardLicense['conversionRules'][number];
export type RateCardGrant = RateCardLicense['entitlements'][number];

/**
 * The rate card's key. `invalidateAiQueries` clears it, so a rule or a model
 * written anywhere refreshes the rate card, the pool's Pricing tab and the
 * wildcard list of the model form; the licence writes clear it too, since the
 * read carries the versions and what they grant.
 */
export const aiRateCardQueryKey = ['ai', 'rate-card'] as const;

/**
 * The versions asked for per request. Less than a console page (200): a version
 * comes with its grants and its rules and their authors, and the API prices a
 * document by the rows it may return. 150 keeps this one under the dearest
 * document the console already sends (pinned by the API's
 * `TestComplexityLimitAdmitsEveryLegitimateQuery`).
 */
export const RATE_CARD_PAGE_SIZE = 150;

const isAiDisabled = (error: unknown) =>
  error instanceof GraphQLRequestError &&
  error.errors.some((item) => item.extensions?.code === 'AIUsage.Disabled');

/**
 * Every licence version with its grants and active rules, all pages walked: the
 * number of requests follows the pages of versions, never the versions.
 */
export const aiRateCardQueryOptions = queryOptions({
  queryKey: aiRateCardQueryKey,
  queryFn: async ({ signal, client }): Promise<RateCardLicense[]> => {
    assertAiRequestAllowed(client);
    const query = AI_RATE_CARD.toString();
    try {
      return await fetchAllPages(async (cursor) => {
        const data = await graphqlClient.request<AiRateCardQuery>(
          query,
          { cursor, limit: RATE_CARD_PAGE_SIZE },
          signal,
        );
        return data.licenses;
      }, signal);
    } catch (error) {
      if (isAiDisabled(error)) revokeAiAccess(client);
      throw error;
    }
  },
});
