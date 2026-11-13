import { useQuery } from '@tanstack/react-query';
import {
  type GrantedScopes,
  grantedScopesQueryOptions,
} from '@/lib/granted-scopes';

/**
 * The scopes of the signed-in session's token (`lib/granted-scopes`).
 * `scopes` is `null` while the token is being read and whenever it does not say.
 * Shared by billing and calculated-entitlement screens; the API remains authoritative.
 */
export function useGrantedScopes(): {
  isPending: boolean;
  scopes: GrantedScopes;
} {
  const { data, isPending } = useQuery(grantedScopesQueryOptions);

  return { isPending, scopes: data ?? null };
}
