import { queryOptions } from '@tanstack/react-query';
import { getAuthToken } from './auth-token';
import { decodeGrantedScopes } from './scope-claims';

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

export {
  decodeGrantedScopes,
  type GrantedScopes,
  hasScope,
} from './scope-claims';

export const grantedScopesQueryOptions = queryOptions({
  queryFn: async () => decodeGrantedScopes(await getAuthToken()),
  queryKey: grantedScopesQueryKey,
  // A token's scopes change with the session, which remounts the app.
  staleTime: 5 * 60_000,
});
