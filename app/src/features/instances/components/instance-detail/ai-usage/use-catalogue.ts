import { useQuery } from '@tanstack/react-query';
import { modelsQueryOptions, useAiAccess } from '@/domains/ai-credits';

/**
 * The model catalogue, for the names the tab shows beside what the rows store.
 * It is asked only of a session that may read models: the tab itself needs the
 * instance alone, and a session that may not read the catalogue sees the rows
 * with the model as it was sent.
 */
export function useCatalogue() {
  const access = useAiAccess();

  return useQuery({
    ...modelsQueryOptions,
    enabled: access.allows('listModels'),
  });
}
