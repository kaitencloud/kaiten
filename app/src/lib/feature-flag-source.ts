import type { EvaluationContext } from '@openfeature/web-sdk';
import tokens from 'virtual:dev-tokens';
import env from '@/env';
import { getAuthToken } from './auth-token';
import { deriveOrganizationId } from './external-id';
import { getStoredDevToken } from './local-auth';

/**
 * Where platform flags are read from, and as whom.
 *
 * Two sources, because there are two deployments: the platform flag service a
 * hosted build evaluates against, and the app's own API, for a build that has
 * no platform service configured. `feature-flags.ts` holds what is evaluated;
 * this module holds only where the evaluation goes and which subject it names.
 */

/** Vite folds this at build time, so it is not a runtime bypass in a real build. */
export const BYPASS_AUTH = import.meta.env.VITE_E2E_BYPASS_AUTH === 'true';
const LOCAL_AUTH = import.meta.env.VITE_LOCAL_AUTH === 'true';

type ClerkWindow = Window & {
  Clerk?: {
    user?: { id?: string } | null;
    organization?: { id?: string } | null;
  };
};

export type FlagSource = {
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
export async function platformSource(): Promise<FlagSource | null> {
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
export async function localSource(): Promise<FlagSource | null> {
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

export function usesPlatform(): boolean {
  return Boolean(env.PLATFORM_API_URL && env.PLATFORM_FLAGS_TOKEN);
}

export function resolveSource(): Promise<FlagSource | null> {
  if (usesPlatform()) {
    return platformSource();
  }
  if (LOCAL_AUTH || BYPASS_AUTH || import.meta.env.DEV) {
    return localSource();
  }
  return Promise.resolve(null);
}
