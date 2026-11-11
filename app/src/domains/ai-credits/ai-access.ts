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
        } catch (error) {
          // A refusal is a negative; an outage only fails the refresh, so a
          // grant already held this session stays, while a first access stays closed.
          if (isExplicitAiDenial(error)) return deny();
          throw error;
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
        if (expiresAt > performance.now()) return { enabled: true, expiresAt };
        // Too old to renew anything: keep an earlier grant as it was, never extend it.
        const held = client.getQueryData<AiAccessSnapshot>(queryKey);
        return held?.enabled === true ? held : deniedAiAccess;
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

/**
 * Whether this session holds a grant, current or not: the last answer was
 * positive and nothing has refused it since. Rendering and requests rely on it so
 * that an expired snapshot (a background tab, a slow or failing refresh) never
 * tears a screen down; only an explicit negative does. Routes still require
 * {@link readCurrentAiAccess}.
 */
export function hasAiAccessGrant(queryClient: QueryClient) {
  const identity = aiIdentityKey();
  return (
    identity !== null &&
    queryClient.getQueryData<AiAccessSnapshot>([...aiAccessQueryKey, identity])
      ?.enabled === true
  );
}

/** A refusal from the API (403, `AIUsage.Disabled`), as opposed to an outage. */
export function isExplicitAiDenial(error: unknown) {
  const failure = error as {
    status?: number;
    code?: string;
    response?: { status?: number };
    data?: { code?: string };
  } | null;
  const status = failure?.status ?? failure?.response?.status;
  return (
    status === 401 ||
    status === 403 ||
    failure?.code === 'AIUsage.Disabled' ||
    failure?.data?.code === 'AIUsage.Disabled'
  );
}

/** Filter projections, never the canonical documents used to restate grants. */
export function isAiEntitlement(type: string | null | undefined) {
  return type === 'NUMBER_AI_CREDIT';
}
