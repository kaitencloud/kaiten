import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { listUsers, setUserAssignments, updateUser, type UpdateUserData, type SetUserAssignmentsData } from '@/api-client';
import { getMeQueryKey, listUsersOptions, listUsersQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';
import { deleteRole, listRoles, saveRole, setUserEnabled, type RoleInput } from './user-management.api';

export const allUsersOptions = () => ({
  ...listUsersOptions(),
  retry: false,
  queryFn: async ({ signal }: { signal: AbortSignal }) => ({
    hasMore: false,
    items: await fetchAllPages(async (cursor) => (await listUsers({
      query: { limit: MAX_PAGE_SIZE, cursor }, signal, throwOnError: true,
    })).data, signal),
  }),
});

export const rolesQueryKey = () => ['access-management', 'roles'] as const;
export const rolesOptions = () => queryOptions({
  queryKey: rolesQueryKey(),
  queryFn: ({ signal }) => listRoles(signal),
  retry: false,
});

export async function refreshAccessQueries(client: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    client.invalidateQueries({ queryKey: listUsersQueryKey() }),
    client.invalidateQueries({ queryKey: rolesQueryKey() }),
    client.invalidateQueries({ queryKey: getMeQueryKey() }),
  ]);
}

export function useAccessMutations() {
  const client = useQueryClient();
  const onSettled = () => refreshAccessQueries(client);
  return {
    profile: useMutation({ mutationFn: (options: Pick<UpdateUserData, 'body' | 'path'>) => updateUser({ ...options, throwOnError: true }), onSettled }),
    authorization: useMutation({ mutationFn: (options: Pick<SetUserAssignmentsData, 'body' | 'path'>) => setUserAssignments({ ...options, throwOnError: true }), onSettled }),
    enabled: useMutation({ mutationFn: setUserEnabled, onSettled }),
    role: useMutation({
      mutationFn: ({ body, slug }: { body: RoleInput; slug?: string }) => saveRole(body, slug),
      onSettled,
    }),
    deleteRole: useMutation({ mutationFn: deleteRole, onSettled }),
  };
}
