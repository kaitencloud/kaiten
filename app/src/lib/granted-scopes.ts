import { queryOptions } from '@tanstack/react-query';
import { getAuthToken } from './auth-token';

/**
 * The scopes the signed-in session's token carries, so that the console offers
 * only the actions the API would accept.
 *
 * This is display only. The token is read, never verified: the API verifies it
 * on every request and answers 403 `Auth.MissingScope` to an action the console
 * offered anyway, which the screens render as a banner. A token this cannot
 * read, or that carries no `scopes` claim (a session token whose template was
 * never extended with them), leaves the scopes unknown, and the console then
 * offers every action and lets the API decide.
 */

export const grantedScopesQueryKey = ['auth', 'granted-scopes'] as const;

/** `null`: the token says nothing about scopes. */
export type GrantedScopes = readonly string[] | null;

const SCOPE = /^[a-z]+:(?:[a-z][a-z0-9_]*|\*)$/;

function decodePayload(token: string): unknown {
  const [, payload] = token.split('.');
  if (!payload) {
    return null;
  }
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * The `scopes` claim of a JWT: a list, or a string of scopes separated by spaces
 * or commas. Null when the token is not a JWT, has no such claim, or the claim
 * holds nothing that reads as a scope.
 */
export function decodeGrantedScopes(
  token: string | null | undefined,
): GrantedScopes {
  if (!token) {
    return null;
  }

  try {
    const claims = decodePayload(token);
    const claim = (claims as { scopes?: unknown } | null)?.scopes;
    const candidates =
      typeof claim === 'string'
        ? claim.split(/[\s,]+/)
        : Array.isArray(claim)
          ? claim
          : [];
    const scopes = candidates.filter(
      (candidate): candidate is string =>
        typeof candidate === 'string' && SCOPE.test(candidate),
    );

    return scopes.length > 0 ? scopes : null;
  } catch {
    return null;
  }
}

/**
 * Whether `granted` covers `required`, as the API decides it
 * (`api/pkg/scope.HasScope`): the scope itself, `write:*` for anything,
 * `read:*` for a read, and `write:<module>` for `read:<module>`. Scopes that
 * are not known (`null`) cover everything: the API has the last word.
 */
export function hasScope(granted: GrantedScopes, required: string): boolean {
  if (granted === null) {
    return true;
  }

  return granted.some((scope) => {
    if (scope === required || scope === 'write:*') {
      return true;
    }
    if (!required.startsWith('read:')) {
      return false;
    }

    return scope === 'read:*' || scope === `write:${required.slice(5)}`;
  });
}

export const grantedScopesQueryOptions = queryOptions({
  queryFn: async () => decodeGrantedScopes(await getAuthToken()),
  queryKey: grantedScopesQueryKey,
  // A token's scopes change with the session, which remounts the app.
  staleTime: 5 * 60_000,
});
