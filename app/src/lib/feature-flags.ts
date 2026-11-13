import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';
import { OpenFeature } from '@openfeature/web-sdk';
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import env from '@/env';
import {
  BYPASS_AUTH,
  type FlagSource,
  localSource,
  platformSource,
  resolveSource,
  usesPlatform,
} from './feature-flag-source';

/**
 * Kaiten's own platform flags — the ones this app gates its own features on —
 * evaluated through OFREP with OpenFeature's generic web provider: Kaiten
 * implements the protocol, so no Kaiten package sits in between.
 *
 * They live in a separate Kaiten deployment, the platform flag service, never
 * in the catalog of the organization using the app: a customer organization's
 * catalog holds that organization's flags for its own product, and nothing in
 * it says whether Kaiten shipped a feature to that organization. So a deployed
 * app evaluates against the service named by `env.PLATFORM_API_URL`, with the
 * public `read:feature_flags` token beside it, for the signed-in organization —
 * in a context shaped so that a rule can read the organization's tracked
 * instance (`__kaiten.instance.metadata.demo`).
 *
 * Ordinary local demo flags retain the session-source fallback. AI never uses
 * a customer catalog: real local builds need the same platform URL/read-only
 * token wiring as hosted builds. Only explicit mocked E2E builds can use their
 * MSW source for AI. A build without a trusted platform source keeps AI off.
 *
 * The flags themselves, each created in the KbK's Dogfooding organization by
 * saas-api's bootstrap (internal/modules/kbkbootstrap/flags.go):
 * - `demo-sandbox` (`DEMO_SANDBOX_FLAG`): the demo banner and seed/reset card,
 *   for organizations whose tracked instance is a demo.
 * - `plan-billing` (`PLAN_BILLING_FLAG`): the Plan & usage page, for
 *   organizations whose tracked instance carries metadata `planBilling=true`
 *   (every organization bought on kaiten.sh).
 *
 * Outbound webhooks are not one of them: an organization has them when its
 * Kaiten licence grants it webhook events (any number but 0), which saas-api
 * checks on every webhooks route,
 * and the console reads the answer off those routes (`domains/webhooks`).
 *
 * The client is readable by router `beforeLoad`, before React context exists.
 */
export const DEMO_SANDBOX_FLAG = 'demo-sandbox';
export const PLAN_BILLING_FLAG = 'plan-billing';
export const AI_CREDITS_FLAG = 'ai-credits';

/** Every platform flag this app reads. */
type PlatformFlag =
  | typeof DEMO_SANDBOX_FLAG
  | typeof PLAN_BILLING_FLAG
  | typeof AI_CREDITS_FLAG;

let providerReady: Promise<void> | null = null;
let providerSubject: string | null = null;

/**
 * Configures the provider on first use, and shares one initialization between
 * concurrent callers.
 *
 * Lazy rather than at bootstrap: the provider loads every flag in one bulk
 * request during initialization, and that request needs a subject Clerk has not
 * resolved yet at bootstrap.
 *
 * Keyed by subject: switching organization remounts the app with a fresh query
 * client, but this module outlives it, and the provider would otherwise keep
 * serving the previous organization's answers.
 *
 * On failure the memo is cleared so a later navigation retries instead of
 * caching the outage for the life of the tab.
 */
function ensureFeatureFlagsReady(source: FlagSource): Promise<void> {
  const subject = `${source.baseUrl} ${String(source.context.targetingKey)}`;
  if (providerSubject !== subject) {
    providerReady = null;
    providerSubject = subject;
  }

  providerReady ??= OpenFeature.setProviderAndWait(
    new OFREPWebProvider({
      baseUrl: source.baseUrl,
      headersFactory: source.headers,
      // No persisted cache. Its default key includes the credential, which
      // Clerk rotates every minute, and a cache-first start would hand the gate
      // the answer from before a toggle: the staleness
      // `subscribeFeatureFlagRefresh` exists to prevent.
      cacheMode: 'disabled',
      // React Query already decides when the gate re-reads. A provider refresh
      // on every tab switch would be a second schedule nobody coordinates.
      disableVisibilityRefresh: true,
    }),
    // Set with the provider, so its first bulk request already names the
    // subject instead of evaluating an empty context.
    source.context,
  ).catch((error: unknown) => {
    providerReady = null;
    providerSubject = null;
    throw error;
  });

  return providerReady;
}

export const featureFlagsQueryKey = ['feature-flags'] as const;

/**
 * Re-evaluates every flag after any successful mutation — when flags are read
 * from the app's own API. The platform flag service's catalog is not something
 * this app mutates, so with one configured this subscribes to nothing.
 *
 * Two caches have to be dropped, not one: React Query's answer, and the web
 * SDK's own — it serves `getBooleanValue` from a map filled at provider
 * initialization, so invalidating the query alone would refetch straight back
 * into the stale evaluation. Dropping the memo instead of re-initializing here
 * keeps it to one bulk request: the invalidated query refetches, and its
 * `ensureFeatureFlagsReady` does the reload.
 *
 * One subscription rather than a call in the feature-flags mutation handlers:
 * the generated mutations carry no `mutationKey`, so there is nothing to filter
 * on, and a seam that cannot be forgotten beats per-call-site precision.
 * It costs one bulk evaluation on an action the user just took — against a gate
 * that otherwise keeps hiding a feature the user just enabled.
 *
 * Returns the unsubscribe function.
 */
export function subscribeFeatureFlagRefresh(
  queryClient: QueryClient,
): () => void {
  if (usesPlatform()) {
    return () => {};
  }

  return queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'updated' && event.mutation.state.status === 'success') {
      providerReady = null;
      void queryClient.invalidateQueries({ queryKey: featureFlagsQueryKey });
    }
  });
}

/**
 * One platform flag, as query options rather than a hook, so that a route guard
 * can resolve it in `beforeLoad`, outside React.
 *
 * Resolves `false` rather than throwing when the evaluation fails, so a gate
 * built on it fails closed.
 */
function platformFlagQueryOptions(flag: PlatformFlag) {
  return queryOptions({
    queryKey: [...featureFlagsQueryKey, flag],
    queryFn: async () => {
      const source = await resolveSource();
      if (!source) {
        return false;
      }

      try {
        await ensureFeatureFlagsReady(source);
      } catch {
        // Fail closed: every platform flag gates something that must not show
        // up by accident, and a route guard that threw here would replace a
        // redirect with an error page.
        return false;
      }

      return OpenFeature.getClient().getBooleanValue(flag, false);
    },
    // The gate is not worth a retry storm on an API that is down: the fallback
    // is already the safe answer.
    retry: false,
  });
}

/**
 * Whether this organization is a demo sandbox: on the platform flag service,
 * `demo-sandbox` targets organizations whose tracked instance carries metadata
 * `demo=true`.
 */
export const demoSandboxFlagQueryOptions =
  platformFlagQueryOptions(DEMO_SANDBOX_FLAG);

/**
 * Whether this organization has the Plan & usage page: on the platform flag
 * service, `plan-billing` targets organizations whose tracked instance carries
 * metadata `planBilling=true`. saas-api checks the same flag before it mints the
 * page's session, so the gate here only decides what is offered.
 */
export const planBillingFlagQueryOptions =
  platformFlagQueryOptions(PLAN_BILLING_FLAG);
let aiEvaluation: { subject: string; pending: Promise<boolean> } | null = null;

/** AI alone requires a fresh network evaluation, never the provider's old map. */
export const aiCreditsFlagQueryOptions = queryOptions({
  queryKey: [...featureFlagsQueryKey, AI_CREDITS_FLAG],
  queryFn: async () => {
    // Only trusted platform wiring or an explicit MSW bypass can supply AI flags.
    const source = usesPlatform()
      ? await platformSource()
      : BYPASS_AUTH && !env.PLATFORM_API_URL && !env.PLATFORM_FLAGS_TOKEN
        ? await localSource()
        : null;
    if (!source) return false;
    const subject = `${source.baseUrl} ${String(source.context.targetingKey)}`;
    // Share pending initialization: replacing it revokes healthy StrictMode reads.
    if (aiEvaluation?.subject === subject) return aiEvaluation.pending;
    const pending = OpenFeature.setProviderAndWait(
      'kaiten-ai-rollout',
      new OFREPWebProvider({
        baseUrl: source.baseUrl,
        headersFactory: source.headers,
        cacheMode: 'disabled',
        pollInterval: 0,
        disableVisibilityRefresh: true,
      }),
      source.context,
    )
      .then(() => {
        const client = OpenFeature.getClient('kaiten-ai-rollout');
        const details = client.getBooleanDetails(AI_CREDITS_FLAG, false);
        return (
          client.providerStatus === 'READY' &&
          details.value === true &&
          !details.errorCode &&
          ['STATIC', 'DEFAULT', 'TARGETING_MATCH', 'SPLIT'].includes(
            details.reason ?? '',
          )
        );
      })
      .catch(() => false);
    aiEvaluation = { subject, pending };
    try {
      return await pending;
    } finally {
      // Never retain a completed result, and never clear another subject's read.
      if (aiEvaluation?.pending === pending) aiEvaluation = null;
    }
  },
  staleTime: 0,
  retry: false,
});
