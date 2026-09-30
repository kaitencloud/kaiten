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
export function optimisticDeleteCallbacks<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  id: string,
  messages: { success: string; error: string },
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
      _error: unknown,
      _variables: unknown,
      context: OptimisticContext | undefined,
    ) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(messages.error);
    },
    onSuccess: () => {
      toast.success(messages.success);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  };
}

/**
 * Returns TanStack Query mutation callbacks that invalidate queries on success.
 */
export function invalidateOnSuccessCallbacks(
  queryClient: QueryClient,
  ...queryKeys: QueryKey[]
) {
  return {
    onSuccess: () => {
      for (const queryKey of queryKeys) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  };
}
