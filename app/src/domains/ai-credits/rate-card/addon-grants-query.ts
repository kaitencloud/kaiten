import { queryOptions } from '@tanstack/react-query';
import type { AiAddonGrantsQuery } from '@/api-client/graphql/graphql';
import { isApiError, isProblem } from '@/lib/errors';
import { graphqlClient, GraphQLRequestError } from '@/lib/graphql-client';
import { assertAiRequestAllowed, revokeAiAccess } from '../ai-request-guard';
import { aiRateCardQueryKey } from './rate-card-query';
import { AI_ADDON_GRANTS } from './rate-card.queries';

/** What one add-on version can grant of a pool to an instance of a licence family. */
export type AddonGrant = NonNullable<
  AiAddonGrantsQuery['license']
>['addonGrants'][number];

/**
 * The add-on grants of a licence family, or why they cannot be read. Not being
 * able to read them is an answer, not a failure: `grantedByAddons` on the rules
 * needs neither billing nor the add-on read scope, so the screens still know that an
 * add-on can grant the pool and only lack which one.
 */
export type AddonGrantsAnswer =
  | { readable: true; grants: AddonGrant[] }
  | {
      readable: false;
      /** Billing is off on the deployment, or the session may not read add-ons. */
      reason: 'BILLING_OFF' | 'NO_SCOPE';
    };

const codesOf = (error: unknown): string[] => {
  if (error instanceof GraphQLRequestError) {
    return error.errors.flatMap((item) =>
      typeof item.extensions?.code === 'string' ? [item.extensions.code] : [],
    );
  }

  return isApiError(error) && isProblem(error.data) && error.data.code
    ? [error.data.code]
    : [];
};

/**
 * What add-on versions can grant of `entitlementSlug` on the family of
 * `licenseSlug`: the same for every version of the family, since an add-on is
 * compatible with a family and attaches to an instance. A document of its own
 * (`AiAddonGrants`), kept under the rate card's key so that what clears the
 * rate card clears it too.
 */
export const aiAddonGrantsQueryOptions = (
  licenseSlug: string,
  entitlementSlug: string,
) =>
  queryOptions({
    queryKey: [
      ...aiRateCardQueryKey,
      'addon-grants',
      licenseSlug,
      entitlementSlug,
    ] as const,
    queryFn: async ({ signal, client }): Promise<AddonGrantsAnswer> => {
      assertAiRequestAllowed(client);
      try {
        const data = await graphqlClient.request<AiAddonGrantsQuery>(
          AI_ADDON_GRANTS.toString(),
          { entitlementSlug, licenseSlug },
          signal,
        );

        return { readable: true, grants: data.license?.addonGrants ?? [] };
      } catch (error) {
        const codes = codesOf(error);
        if (codes.includes('AIUsage.Disabled')) {
          revokeAiAccess(client);
        }
        if (codes.some((code) => code.startsWith('Billing.'))) {
          return { readable: false, reason: 'BILLING_OFF' };
        }
        if (codes.includes('Auth.MissingScope')) {
          return { readable: false, reason: 'NO_SCOPE' };
        }
        throw error;
      }
    },
    retry: false,
  });
