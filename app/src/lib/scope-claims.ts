/**
 * What the `scopes` claim of a token says, and what it covers, with no way to get the
 * token: the pure half of `granted-scopes.ts`, which the mocks of the API share with the
 * console without pulling in where the token comes from (`auth-token.ts`).
 */

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
