import { subscribeAiFlagUnavailable } from '@/lib/ai-feature-flag-events';
import type { Query, QueryClient } from '@tanstack/react-query';
import { client } from '@/api-client/client.gen';
import {
  aiAccessQueryKey,
  hasCurrentAiAccess,
  isAiEntitlement,
  aiAccessQueryOptions,
  deniedAiAccess,
} from './ai-access';

const AI_OPERATIONS = new Set([
  'listModels',
  'getModel',
  'listConversionRules',
  'getConversionRule',
  'listAiInferences',
  'listAiReservations',
]);

export function isAiOperationalQuery(query: Pick<Query, 'queryKey'>) {
  const key = query.queryKey[0];
  return (
    key === 'ai' ||
    key === 'openrouter' ||
    (typeof key === 'object' &&
      key !== null &&
      '_id' in key &&
      AI_OPERATIONS.has(String(key._id)))
  );
}

export function assertAiRequestAllowed(queryClient: QueryClient) {
  if (!hasCurrentAiAccess(queryClient)) throw new Error('AIUsage.Disabled');
}

function isAiPath(path: string) {
  return (
    /^\/models(?:\/|$)/.test(path) ||
    /^\/licenses\/[^/]+\/conversion-rules(?:\/|$)/.test(path) ||
    /^\/instances\/[^/]+\/entitlements\/[^/]+\/usage\/(?:inferences|reservations)(?:\/|$)/.test(
      path,
    )
  );
}

function isCachedAiTarget(queryClient: QueryClient, slug: string) {
  return queryClient
    .getQueryCache()
    .getAll()
    .some((query) => {
      const key = query.queryKey[0];
      if (
        typeof key !== 'object' ||
        key === null ||
        !('_id' in key) ||
        ![
          'listEntitlements',
          'getEntitlement',
          'getLicenseEntitlements',
          'listAddonEntitlements',
          'getAddonEntitlement',
        ].includes(String(key._id))
      )
        return false;
      const data = query.state.data as
        | {
            type?: string;
            slug?: string;
            entitlementSlug?: string;
            entitlementType?: string;
            items?: {
              type?: string;
              slug?: string;
              entitlementSlug?: string;
              entitlementType?: string;
            }[];
          }
        | undefined;
      return (
        ((data?.slug ?? data?.entitlementSlug) === slug &&
          isAiEntitlement(data?.type ?? data?.entitlementType)) ||
        (Array.isArray(data) ? data : data?.items)?.some(
          (item) =>
            (item.slug ?? item.entitlementSlug) === slug &&
            isAiEntitlement(item.type ?? item.entitlementType),
        )
      );
    });
}

export function revokeAiAccess(queryClient: QueryClient) {
  void queryClient.cancelQueries({ queryKey: aiAccessQueryKey });
  queryClient.setQueriesData({ queryKey: aiAccessQueryKey }, deniedAiAccess);
}

/** Defense in depth for retained callbacks: hiding a button alone is not a gate. */
export function subscribeAiAccess(queryClient: QueryClient) {
  const active = new Map<Request, AbortController>();
  let expiry: ReturnType<typeof setTimeout> | undefined;
  function scheduleExpiry() {
    clearTimeout(expiry);
    const snapshot = queryClient.getQueryData(aiAccessQueryOptions().queryKey);
    if (snapshot?.enabled && Number.isFinite(snapshot.expiresAt)) {
      expiry = setTimeout(
        () => {
          if (!hasCurrentAiAccess(queryClient)) revokeAiAccess(queryClient);
        },
        Math.max(0, snapshot.expiresAt - performance.now()),
      );
    }
  }
  const unsubscribeFlag = subscribeAiFlagUnavailable(() => {
    revokeAiAccess(queryClient);
  });
  function cancelOperationalRequests() {
    for (const controller of active.values()) controller.abort();
    active.clear();
  }
  const requestGuard = async (request: Request) => {
    const pathname = new URL(request.url).pathname;
    const baseUrl = client.getConfig().baseUrl;
    const basePath = baseUrl
      ? new URL(baseUrl, request.url).pathname.replace(/\/+$/, '')
      : '';
    // Match operation paths, never arbitrary customer/entitlement slugs named "models".
    const path =
      basePath && pathname.startsWith(`${basePath}/`)
        ? pathname.slice(basePath.length)
        : pathname;
    const target = /\/entitlements\/([^/]+)/.exec(path)?.[1];
    let ai =
      isAiPath(path) ||
      (target !== undefined &&
        isCachedAiTarget(queryClient, decodeURIComponent(target)) &&
        !/\/usage\/(?:reports|export)(?:\/|$)/.test(path));
    if (
      request.method !== 'GET' &&
      request.headers.get('Content-Type')?.includes('json')
    ) {
      const body = (await request
        .clone()
        .json()
        .catch(() => null)) as {
        type?: string;
        entitlementSlug?: string;
        value?: { type?: string };
        meteredEntitlementSlug?: string;
        metered?: { entitlementSlug?: string };
      } | null;
      ai ||=
        isAiEntitlement(body?.type) ||
        body?.value?.type === 'ai_usage' ||
        [
          body?.entitlementSlug,
          body?.meteredEntitlementSlug,
          body?.metered?.entitlementSlug,
        ].some(
          (slug) => slug !== undefined && isCachedAiTarget(queryClient, slug),
        );
    }
    if (!ai) return request;
    assertAiRequestAllowed(queryClient);
    const controller = new AbortController();
    const guarded = new Request(request, {
      signal: AbortSignal.any([request.signal, controller.signal]),
    });
    active.set(guarded, controller);
    return guarded;
  };
  const responseGuard = (response: Response, request: Request) => {
    active.delete(request);
    return response;
  };
  const errorGuard = (
    error: unknown,
    _response?: Response,
    request?: Request,
  ) => {
    if (request) active.delete(request);
    const data = (error as { data?: { code?: string } } | null)?.data;
    if (data?.code === 'AIUsage.Disabled') {
      revokeAiAccess(queryClient);
    }
    return error;
  };
  client.interceptors.request.use(requestGuard);
  client.interceptors.error.use(errorGuard);
  client.interceptors.response.use(responseGuard);
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type === 'updated' &&
      event.query.queryKey[0] === 'feature-flags' &&
      event.action.type === 'invalidate'
    ) {
      queryClient.setQueriesData(
        { queryKey: aiAccessQueryKey },
        deniedAiAccess,
      );
      void queryClient.invalidateQueries({ queryKey: aiAccessQueryKey });
    }
    if (event.query.queryKey[0] === aiAccessQueryKey[0]) scheduleExpiry();
    if (
      event.query.queryKey[0] !== aiAccessQueryKey[0] ||
      hasCurrentAiAccess(queryClient)
    )
      return;
    cancelOperationalRequests();
    // Cancel first, then remove: a late positive operation must not survive denial.
    void queryClient.cancelQueries({ predicate: isAiOperationalQuery });
    queryClient.removeQueries({ predicate: isAiOperationalQuery });
  });
  scheduleExpiry();
  return () => {
    clearTimeout(expiry);
    unsubscribe();
    unsubscribeFlag();
    client.interceptors.request.eject(requestGuard);
    client.interceptors.error.eject(errorGuard);
    client.interceptors.response.eject(responseGuard);
    cancelOperationalRequests();
    void queryClient.cancelQueries({ predicate: isAiOperationalQuery });
    queryClient.removeQueries({ predicate: isAiOperationalQuery });
  };
}
