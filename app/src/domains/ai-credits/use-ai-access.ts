import { useQuery } from '@tanstack/react-query';
import { useGrantedScopes } from '@/hooks/use-granted-scopes';
import {
  OPERATION_SCOPES,
  type ApiOperationId,
} from '@/lib/api/operation-scopes.gen';
import { hasScope } from '@/lib/granted-scopes';
import { aiCreditsFlagQueryOptions } from '@/lib/feature-flags';

/** UI affordances only: unknown token scopes defer to the API. */
export function useAiAccess() {
  const flag = useQuery(aiCreditsFlagQueryOptions);
  const { scopes, isPending } = useGrantedScopes();
  function allows(operation: ApiOperationId) {
    return (
      !isPending &&
      OPERATION_SCOPES[operation].every((scope) => hasScope(scopes, scope))
    );
  }
  return {
    flag,
    isPending: flag.isPending || isPending,
    available: flag.data === true && !flag.isError,
    allows,
  };
}
