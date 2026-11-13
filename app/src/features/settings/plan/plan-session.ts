import { KaitenSessionClient } from '@kaitencloud/client';
import { queryOptions } from '@tanstack/react-query';
import env from '@/env';
import { isApiError } from '@/lib/errors';
import { createPlanSession } from './plan.api';
import type { PlanSession, PlanSessionProblem } from './types';

/** How long before its expiry a session is no longer handed out. */
const RENEW_BEFORE_MS = 60_000;

/**
 * The page's first session, read like data so that a refusal is drawn as a
 * state of the page rather than as an error inside the SDK's components.
 * Not kept once the page is left: a session lasts 30 minutes, and a visit later
 * mints its own.
 */
export const planSessionQueryOptions = queryOptions({
  queryKey: ['settings', 'plan', 'session'] as const,
  queryFn: createPlanSession,
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 0,
  retry: false,
});

/** What saas-api's refusal means for the page. */
export function planSessionProblem(error: unknown): PlanSessionProblem {
  if (!isApiError(error)) {
    return 'unavailable';
  }

  const code = (error.data as { code?: unknown } | null | undefined)?.code;
  if (code === 'CreatePlanSession.NotEnabled') {
    return 'not-enabled';
  }
  if (code === 'CreatePlanSession.NotProvisioned') {
    return 'not-provisioned';
  }
  if (error.status === 403) {
    return 'forbidden';
  }

  return 'unavailable';
}

/**
 * What the SDK's session client calls for a session: the one the page already
 * minted, once, while it has more than a minute left; then a fresh one from
 * saas-api each time. Opening the page costs one session, not two.
 */
export function planSessionSupplier(
  first: PlanSession,
  mint: () => Promise<PlanSession> = createPlanSession,
  now: () => number = Date.now,
): () => PlanSession | Promise<PlanSession> {
  let pending: PlanSession | undefined = first;

  return () => {
    const session = pending;
    pending = undefined;
    if (session && Date.parse(session.expiresAt) - now() > RENEW_BEFORE_MS) {
      return session;
    }

    return mint();
  };
}

/**
 * The SDK's session client for the page, against Kaiten Cloud's public surface
 * (`env.PLATFORM_API_URL`, the deployment that bills this organization). The SDK
 * asks for a session before the current one expires, and after Kaiten refuses it.
 */
export function createPlanSessionClient(
  first: PlanSession,
): KaitenSessionClient {
  return new KaitenSessionClient({
    apiUrl: env.PLATFORM_API_URL,
    getCustomerSession: planSessionSupplier(first),
  });
}
