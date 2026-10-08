import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';
import { type EvaluationContext, OpenFeature } from '@openfeature/web-sdk';
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import tokens from 'virtual:dev-tokens';
import env from '@/env';
import { getAuthToken } from './auth-token';
import { deriveOrganizationId } from './external-id';
import { getStoredDevToken } from './local-auth';

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
 * Local and e2e builds have no platform flag service: there the app's own API
 * plays that part, with the session's credential, as it always has. A deployed
 * build with none configured (self-hosted) evaluates nothing, and every
 * platform flag is off.
 *
 * The flags themselves, each created in the KbK's Dogfooding organization by
 * saas-api's bootstrap (internal/modules/kbkbootstrap/flags.go):
 * - `demo-sandbox` (`DEMO_SANDBOX_FLAG`): the demo banner and seed/reset card,
 *   for organizations whose tracked instance is a demo.
 *
 * Outbound webhooks are not one of them: an organization has them when its
 * Kaiten licence carries them, which saas-api checks on every webhooks route,
 * and the console reads the answer off those routes (`domains/webhooks`).
 *
 * Why not a React-bound client: it lives in React context, so it cannot be read
 * from a router `beforeLoad`, which runs before the tree renders.
 */
export const DEMO_SANDBOX_FLAG = 'demo-sandbox';

/** Every platform flag this app reads. */
type PlatformFlag = typeof DEMO_SANDBOX_FLAG;

/** Vite folds this at build time, so it is not a runtime bypass in a real build. */
const BYPASS_AUTH = import.meta.env.VITE_E2E_BYPASS_AUTH === 'true';
const LOCAL_AUTH = import.meta.env.VITE_LOCAL_AUTH === 'true';

type ClerkWindow = Window & {
  Clerk?: {
    user?: { id?: string } | null;
    organization?: { id?: string } | null;
  };
};

/** Where platform flags are read from, and as whom. */
type FlagSource = {
  baseUrl: string;
  headers: () => Promise<[string, string][]>;
  context: EvaluationContext;
};

/**
 * The organization platform flags are evaluated for: Kaiten's internal id for
 * the signed-in organization.
 *
 * Two ways to get there, because there are two ways to sign in. A dev token
 * carries the internal id outright (the seeder assigned it), and a session from
 * an identity provider carries the external one, which the API derives the
 * internal id from -- so the browser derives it the same way rather than asking.
 *
 * Null when no organization can be identified, which keeps every gate closed
 * rather than evaluating for nobody.
 */
async function resolveOrganizationId(): Promise<string | null> {
  if (LOCAL_AUTH) {
    const current = getStoredDevToken();

    return tokens.find((entry) => entry.token === current)?.org_id ?? null;
  }

  const externalOrganizationId = (window as ClerkWindow).Clerk?.organization
    ?.id;

  return externalOrganizationId
    ? deriveOrganizationId(externalOrganizationId)
    : null;
}

/**
 * The platform source: this app's own organization, as the platform flag
 * service knows it.
 */
async function platformSource(): Promise<FlagSource | null> {
  const organizationId = await resolveOrganizationId();
  if (!organizationId) {
    return null;
  }

  const token = env.PLATFORM_FLAGS_TOKEN;

  return {
    // Ends in `/api`: the provider appends `/ofrep/v1/...` to it.
    baseUrl: env.PLATFORM_API_URL,
    headers: async () => [['Authorization', `Bearer ${token}`]],
    context: {
      targetingKey: organizationId,
      organizationId,
      kaiten: { instanceSlug: organizationId },
    },
  };
}

/**
 * The local source, for builds with no platform flag service: the app's own API,
 * as the signed-in user — the subject the seeded rules reference
 * (`user.role == 'admin'`).
 *
 * The targeting key is not optional: the evaluator answers PROVIDER_FATAL
 * ("missing targeting key") for any flag it cannot pin to a subject, which the
 * SDK maps to the default value, so an empty context reads as "every flag is off".
 */
async function localSource(): Promise<FlagSource | null> {
  // Without a credential there is nothing to evaluate against, and asking
  // anyway would cache "off" for a session that is merely still signing in.
  // The e2e build is the deliberate exception: it bypasses auth entirely and
  // answers from MSW, so it has no token to offer and never will.
  if (!BYPASS_AUTH && !(await getAuthToken())) {
    return null;
  }

  const userId = LOCAL_AUTH
    ? // Identity comes from the token TABLE, never from decoding the JWT's own
      // claims: the seeder that creates the orgs writes that table, so it
      // cannot drift from them the way a renamed claim does.
      (tokens.find((entry) => entry.token === getStoredDevToken())?.user_id ??
      null)
    : ((window as ClerkWindow).Clerk?.user?.id ?? null);
  // `e2e` stands in for the user the bypassed build never signs in as; the MSW
  // handler ignores it, and the real evaluator would reject an empty one.
  const targetingKey = userId ?? (BYPASS_AUTH ? 'e2e' : null);
  if (!targetingKey) {
    return null;
  }

  return {
    baseUrl: env.API_URL,
    // Consulted per request, so a rotated Clerk token is picked up on its own.
    headers: async () => {
      const token = await getAuthToken();
      return token ? [['Authorization', `Bearer ${token}`]] : [];
    },
    context: { targetingKey },
  };
}

function usesPlatform(): boolean {
  return Boolean(env.PLATFORM_API_URL && env.PLATFORM_FLAGS_TOKEN);
}

function resolveSource(): Promise<FlagSource | null> {
  if (usesPlatform()) {
    return platformSource();
  }
  if (LOCAL_AUTH || BYPASS_AUTH || import.meta.env.DEV) {
    return localSource();
  }
  return Promise.resolve(null);
}

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
