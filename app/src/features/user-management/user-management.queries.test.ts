import { describe, expect, it, vi } from 'vite-plus/test';
import { focusManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { allUsersOptions, refreshAccessQueries } from './user-management.queries';
import { getMeQueryKey, listUsersQueryKey } from '@/api-client/@tanstack/react-query.gen';

describe('users directory freshness', () => {
 it('keeps the generated key and refreshes on entry and every 30 seconds', () => {
  expect(allUsersOptions()).toMatchObject({
   queryKey: listUsersQueryKey(),
   staleTime: 0,
   refetchOnMount: 'always',
   refetchInterval: 30_000,
  });
  expect(allUsersOptions()).not.toHaveProperty('refetchIntervalInBackground');
 });

 it('refetches cached users on mount and remount, polling only while visible and observed', async () => {
  vi.useFakeTimers();
  focusManager.setFocused(true);
  const client = new QueryClient({
   defaultOptions: { queries: { staleTime: Infinity, refetchOnMount: false } },
  });
  const queryFn = vi.fn(async () => ({ hasMore: false, items: [] }));
  const options = { ...allUsersOptions(), queryFn };
  client.setQueryData(options.queryKey, { hasMore: false, items: [] });
  const observer = new QueryObserver(client, options);
  let unsubscribe = observer.subscribe(() => {});
  try {
   await vi.advanceTimersByTimeAsync(0);
   expect(queryFn).toHaveBeenCalledTimes(1);
   await vi.advanceTimersByTimeAsync(29_999);
   expect(queryFn).toHaveBeenCalledTimes(1);
   await vi.advanceTimersByTimeAsync(1);
   expect(queryFn).toHaveBeenCalledTimes(2);

   focusManager.setFocused(false);
   await vi.advanceTimersByTimeAsync(30_000);
   expect(queryFn).toHaveBeenCalledTimes(2);
   focusManager.setFocused(true);
   await vi.advanceTimersByTimeAsync(30_000);
   expect(queryFn).toHaveBeenCalledTimes(3);

   unsubscribe();
   await vi.advanceTimersByTimeAsync(30_000);
   expect(queryFn).toHaveBeenCalledTimes(3);
   unsubscribe = new QueryObserver(client, options).subscribe(() => {});
   await vi.advanceTimersByTimeAsync(0);
   expect(queryFn).toHaveBeenCalledTimes(4);
  } finally {
   unsubscribe();
   client.clear();
   focusManager.setFocused(undefined);
   vi.useRealTimers();
  }
 });
});

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
