import tokens from 'virtual:dev-tokens';
import { getStoredDevToken } from './local-auth';

/**
 * Who is signed in, as the identity provider names them: the external ids,
 * which a page can read synchronously and which do not change under it.
 */
export type SessionIdentity = {
  userId: string;
  /** The external organization id; empty outside an organization. */
  organizationId: string;
};

type ClerkWindow = Window & {
  Clerk?: {
    user?: { id?: string } | null;
    organization?: { id?: string } | null;
  };
};

/** The one identity the bypassed build (`dev:mock`, the mocked e2e) runs as. */
const BYPASS_IDENTITY: SessionIdentity = {
  userId: 'e2e',
  organizationId: 'e2e',
};

let lastKnown: SessionIdentity | null = null;

/**
 * Who was last seen signed in by this page, if anyone: what a sign-out screen
 * can still know of the person after Clerk has forgotten them.
 */
export function getLastKnownIdentity(): SessionIdentity | null {
  return lastKnown;
}

/**
 * The signed-in person and organization, read now, or null when nobody is
 * known yet. Synchronous on purpose: a caller that keys something on the
 * identity (the stored input of a creation form) reads it once, at mount.
 *
 * - local accounts (`VITE_LOCAL_AUTH`): the entry of the selected dev token,
 *   by its external organization id when the seeder wrote one;
 * - the bypassed build: a fixed identity, so the suites that run without a
 *   sign-in can still exercise what depends on one;
 * - otherwise Clerk, whose ids the browser SDK exposes on `window`.
 *
 * The internal organization id is not used: deriving it is asynchronous.
 */
export function getSessionIdentity(): SessionIdentity | null {
  const identity = readSessionIdentity();
  if (identity) lastKnown = identity;
  return identity;
}

function readSessionIdentity(): SessionIdentity | null {
  if (import.meta.env.VITE_LOCAL_AUTH === 'true') {
    const current = getStoredDevToken();
    const entry = tokens.find((candidate) => candidate.token === current);

    if (!entry?.user_id) {
      return null;
    }

    return {
      userId: entry.user_id,
      organizationId: entry.org_external_id ?? entry.org_id,
    };
  }

  if (import.meta.env.VITE_E2E_BYPASS_AUTH === 'true') {
    return BYPASS_IDENTITY;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const clerk = (window as ClerkWindow).Clerk;
  const userId = clerk?.user?.id;

  if (!userId) {
    return null;
  }

  return { userId, organizationId: clerk?.organization?.id ?? '' };
}
