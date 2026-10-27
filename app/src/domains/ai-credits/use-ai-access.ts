import { useQuery } from '@tanstack/react-query';
import { useGrantedScopes } from '@/hooks/use-granted-scopes';
import {
  OPERATION_SCOPES,
  type ApiOperationId,
} from '@/lib/api/operation-scopes.gen';
import { hasScope } from '@/lib/granted-scopes';
import { aiAccessQueryOptions } from './ai-access';

/** UI affordances only: unknown token scopes defer to the API. */
export function useAiAccess() {
  const flag = useQuery(aiAccessQueryOptions());
  const { scopes, isPending } = useGrantedScopes();
  // The shared QueryClient deadline revokes expiry; rendering reads only its subscribed snapshot.
  const available =
    flag.isSuccess &&
    !flag.isStale &&
    !flag.isError &&
    flag.data?.enabled === true;
  function allows(operation: ApiOperationId) {
    return (
      available &&
      !isPending &&
      OPERATION_SCOPES[operation].every((scope) => hasScope(scopes, scope))
    );
  }
  return {
    flag,
    isPending: flag.isPending || isPending,
    available,
    allows,
  };
}
