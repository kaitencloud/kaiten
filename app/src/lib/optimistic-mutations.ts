import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';

type OptimisticContext = { previousData: unknown };

// Accepts either a bare array (endpoints not yet migrated to cursor
// pagination) or a { items } page envelope (migrated endpoints), so this
// helper doesn't need a matching edit every time another endpoint moves to
// the shared pagination.Page shape.
const filterListData = <T extends { id: string }>(
  old: T[] | { items: T[] } | undefined,
  id: string,
): T[] | { items: T[] } | undefined => {
  if (!old) {
    return old;
  }
  if (Array.isArray(old)) {
    return old.filter((item) => item.id !== id);
  }
  return { ...old, items: old.items.filter((item) => item.id !== id) };
};

/**
 * Returns TanStack Query mutation callbacks for optimistic delete from a list.
 *
 * Handles: cancel queries → snapshot → filter item → rollback on error → invalidate on settle.
 */
export function optimisticDeleteCallbacks<
  T extends { id: string },
  TVariables = unknown,
>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  id: string,
  messages: { success: string; error: string },
  options: {
    /**
     * Called with the failure and the variables of the delete, after the list is
     * put back: true when the caller shows it itself (a dialog that says what
     * keeps the record), and then there is no toast. The variables name the record
     * the delete was for, and that is where to read it from: the component that
     * asked may show another record by the time the API answers, since the row it
     * is in leaves the list and a row is keyed by its position.
     */
    handleError?: (error: unknown, variables: TVariables) => boolean;
  } = {},
) {
  return {
    onMutate: async (): Promise<OptimisticContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(
        queryKey,
        (old: T[] | { items: T[] } | undefined) => filterListData(old, id),
      );
      return { previousData };
    },
    onError: (
      error: unknown,
      variables: TVariables,
      context: OptimisticContext | undefined,
    ) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      if (!options.handleError?.(error, variables)) {
        toast.error(messages.error);
      }
    },
    onSuccess: () => {
      toast.success(messages.success);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  };
}
