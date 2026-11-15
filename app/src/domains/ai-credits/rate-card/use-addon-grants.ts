import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useGrantedScopes } from '@/hooks/use-granted-scopes';
import { OPERATION_SCOPES } from '@/lib/api/operation-scopes.gen';
import { hasScope } from '@/lib/granted-scopes';
import {
  type AddonGrant,
  type AddonGrantsAnswer,
  aiAddonGrantsQueryOptions,
} from './addon-grants-query';

/** What is known of the add-ons that can grant a pool on a licence family. */
export type AddonGrantsState =
  | { status: 'READY'; grants: AddonGrant[] }
  | { status: 'PENDING' }
  | {
      status: 'UNREADABLE';
      /** Billing off, no scope to read add-ons, or a read that failed. */
      reason: 'BILLING_OFF' | 'ERROR' | 'NO_SCOPE';
    };

/** One licence version of each family to ask for: any version answers for its family. */
export type AddonGrantsTarget = { familySlug: string; licenseSlug: string };

const NO_SCOPE: AddonGrantsState = { status: 'UNREADABLE', reason: 'NO_SCOPE' };

/**
 * The add-on grants of a pool, by licence family: one small read per family
 * (`AiAddonGrants`), apart from the rate card's so that a refusal of it never
 * takes the rate card down. A session whose token says it may not read add-ons
 * is not asked at all; where billing is off the API's refusal is the answer.
 */
export function useAddonGrants(
  /** A stable list (memoised by the caller): the map is rebuilt when it changes. */
  targets: readonly AddonGrantsTarget[],
  entitlementSlug: string,
  enabled = true,
): ReadonlyMap<string, AddonGrantsState> {
  const { scopes, isPending } = useGrantedScopes();
  // The scope the API asks for the field is the one of the add-on reads: the
  // compatibility of add-ons with licence families is the nearest operation.
  const readable =
    !isPending &&
    OPERATION_SCOPES.listAddonCompatibility.every((scope) =>
      hasScope(scopes, scope),
    );
  // `combine` gives the same map for as long as no answer changed, so that
  // what reads it (column heads, cells) is not drawn again on every render.
  const combine = useCallback(
    (results: UseQueryResult<AddonGrantsAnswer>[]) =>
      new Map(
        targets.map((target, index): [string, AddonGrantsState] => {
          const query = results[index];
          if (!isPending && !readable) {
            return [target.familySlug, NO_SCOPE];
          }
          if (query?.isError) {
            return [
              target.familySlug,
              { status: 'UNREADABLE', reason: 'ERROR' },
            ];
          }
          if (!query?.data) {
            return [target.familySlug, { status: 'PENDING' }];
          }

          return [
            target.familySlug,
            query.data.readable
              ? { status: 'READY', grants: query.data.grants }
              : { status: 'UNREADABLE', reason: query.data.reason },
          ];
        }),
      ),
    [targets, isPending, readable],
  );

  return useQueries({
    combine,
    queries: targets.map((target) => ({
      ...aiAddonGrantsQueryOptions(target.licenseSlug, entitlementSlug),
      enabled: enabled && readable && entitlementSlug !== '',
    })),
  });
}

/** The names of the add-ons that can grant the pool, each once, in the order read. */
export function addonNamesOf(state: AddonGrantsState | undefined): string[] {
  return state?.status === 'READY'
    ? [...new Set(state.grants.map((grant) => grant.addonName))]
    : [];
}
