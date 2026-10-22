import { describe, expect, it, vi } from 'vite-plus/test';
import { QueryClient } from '@tanstack/react-query';
import { refreshAccessQueries } from './user-management.queries';
import { getMeQueryKey, listUsersQueryKey } from '@/api-client/@tanstack/react-query.gen';

describe('access mutations refresh authoritative state', () => {
 it('invalidates current identity, users and role definitions', async () => {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client,'invalidateQueries').mockResolvedValue();
  await refreshAccessQueries(client);
  expect(invalidate).toHaveBeenCalledWith({queryKey:getMeQueryKey()});
  expect(invalidate).toHaveBeenCalledWith({queryKey:listUsersQueryKey()});
  expect(invalidate).toHaveBeenCalledWith({queryKey:['access-management','roles']});
 });
});
