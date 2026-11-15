import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { notFound } from '@tanstack/react-router';
import { aiCreditsFlagQueryOptions } from '@/lib/feature-flags';
import { getSessionIdentity } from '@/lib/session-identity';
import { readAiCapability } from './ai-capabilities.api';

export const aiAccessQueryKey = ['ai-availability'] as const;
export const AI_ACCESS_FRESHNESS_MS = 30_000;
// Monotonic tab-local deadlines, never persisted wall-clock capability claims.
export type AiAccessSnapshot = { enabled: boolean; expiresAt: number };
export const deniedAiAccess: AiAccessSnapshot = {
  enabled: false,
  expiresAt: 0,
};

export function aiIdentityKey() {
  const identity = getSessionIdentity();
  return identity ? `${identity.userId}/${identity.organizationId}` : null;
}

export function aiAccessQueryOptions() {
  const identity = aiIdentityKey();
  const queryKey = [...aiAccessQueryKey, identity];
  return queryOptions({
    queryKey,
    queryFn: async ({ signal, client }): Promise<AiAccessSnapshot> => {
      if (!identity) return deniedAiAccess;
      // A known negative wins without waiting for the other (possibly hung) read.
      let refuse!: (value: AiAccessSnapshot) => void;
      const refusal = new Promise<AiAccessSnapshot>((resolve) => {
        refuse = resolve;
      });
      const deny = () => {
        if (!signal.aborted) client.setQueryData(queryKey, deniedAiAccess);
        refuse(deniedAiAccess);
        return null;
      };
      const observe = async (read: Promise<boolean> | boolean) => {
        try {
          return (await read) === true ? performance.now() : deny();
        } catch {
          return deny();
        }
      };
      const success = Promise.all([
        observe(readAiCapability(signal)),
        observe(aiCreditsFlagQueryOptions.queryFn!({} as never)),
      ]).then(([capabilityAt, flagAt]) => {
        if (
          capabilityAt === null ||
          flagAt === null ||
          signal.aborted ||
          identity !== aiIdentityKey()
        )
          return deniedAiAccess;
        // Completion of a slow aggregate must not renew an older observation.
        const expiresAt =
          Math.min(capabilityAt, flagAt) + AI_ACCESS_FRESHNESS_MS;
        return expiresAt > performance.now()
          ? { enabled: true, expiresAt }
          : deniedAiAccess;
      });
      return Promise.race([refusal, success]);
    },
    staleTime: AI_ACCESS_FRESHNESS_MS,
    refetchInterval: AI_ACCESS_FRESHNESS_MS / 3,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    retry: false,
  });
}

/** Read a fresh decision, not the truthiness of a snapshot object. */
export async function readCurrentAiAccess(queryClient: QueryClient) {
  const snapshot = await queryClient.fetchQuery({
    ...aiAccessQueryOptions(),
    staleTime: 0,
  });
  return snapshot.enabled && snapshot.expiresAt > performance.now();
}

/** Never authorize a route from ensureQueryData's possibly stale positive answer. */
export async function requireAiAccess(queryClient: QueryClient) {
  try {
    if (!(await readCurrentAiAccess(queryClient))) throw notFound();
  } catch {
    // Provider-denial revocation can cancel this read too; it is still unavailable.
    throw notFound();
  }
}

export function hasCurrentAiAccess(queryClient: QueryClient) {
  const identity = aiIdentityKey();
  const state = queryClient.getQueryState<AiAccessSnapshot>([
    ...aiAccessQueryKey,
    identity,
  ]);
  return (
    identity !== null &&
    state?.status === 'success' &&
    !state.isInvalidated &&
    state.data?.enabled === true &&
    Number.isFinite(state.data.expiresAt) &&
    state.data.expiresAt > performance.now()
  );
}

/** Filter projections, never the canonical documents used to restate grants. */
export function isAiEntitlement(type: string | null | undefined) {
  return type === 'NUMBER_AI_CREDIT';
}
