import { useQuery } from '@tanstack/react-query';
import { loadCelEngine } from '../logic/cel-engine.loader';
import type { CelEngineInstance } from '../types/cel-engine.types';

export const CEL_ENGINE_QUERY_KEY = ['cel-engine'] as const;

type UseCelEngineQueryOptions = {
  enabled?: boolean;
};

export function useCelEngineQuery(options?: UseCelEngineQueryOptions) {
  return useQuery<CelEngineInstance>({
    queryKey: CEL_ENGINE_QUERY_KEY,
    queryFn: loadCelEngine,
    enabled: options?.enabled ?? true,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 2,
  });
}
