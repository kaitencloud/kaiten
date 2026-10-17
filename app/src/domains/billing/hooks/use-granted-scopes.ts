import { useQuery } from '@tanstack/react-query';
import {
  type GrantedScopes,
  grantedScopesQueryOptions,
} from '@/lib/granted-scopes';

/**
 * The scopes of the signed-in session's token (`lib/granted-scopes`).
 * `scopes` is `null` while the token is being read and whenever it does not say.
 * Only billing reads them today: it moves to `hooks/` when a second feature does.
 */
export function useGrantedScopes(): {
  isPending: boolean;
  scopes: GrantedScopes;
} {
  const { data, isPending } = useQuery(grantedScopesQueryOptions);

  return { isPending, scopes: data ?? null };
}
