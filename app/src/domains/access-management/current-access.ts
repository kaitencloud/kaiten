import { useQuery } from '@tanstack/react-query';
import { getMeOptions } from '@/api-client/@tanstack/react-query.gen';

/** Stored authorization, never provider claims; refreshed when access changes. */
export const currentAccessQueryOptions = () => ({
  ...getMeOptions(),
  staleTime: 0,
  refetchInterval: 30_000,
  retry: false,
});

export function useCurrentAccess() {
  return useQuery(currentAccessQueryOptions());
}

export function isAdministrator(
  me:
    | { user: { authorization: { enabled: boolean; roles: string[] } } }
    | undefined,
) {
  return Boolean(
    me?.user.authorization.enabled &&
    me.user.authorization.roles.includes('administrator'),
  );
}

// Display capability mirrors Core's scope vocabulary, never provider claims.
export function hasAccessScope(scopes: string[], required: string) {
  if (scopes.includes(required) || scopes.includes('write:*')) return true;
  if (required.startsWith('read:'))
    return (
      scopes.includes('read:*') || scopes.includes(`write:${required.slice(5)}`)
    );
  return false;
}
export function canDelegateScopes(scopes: string[], grants: string[]) {
  return grants.every((grant) => hasAccessScope(scopes, grant));
}
