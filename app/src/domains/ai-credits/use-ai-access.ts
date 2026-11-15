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
  // Last known answer: a stale, refreshing or failing snapshot keeps a grant,
  // only an explicit negative (data `enabled: false`) withdraws it. Never true
  // before a first positive answer.
  const available = flag.data?.enabled === true;
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
