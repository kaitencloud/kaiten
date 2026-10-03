import { QueryClient, isCancelledError } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw/http';
import { describe, expect, it } from 'vite-plus/test';
import { server } from './msw-server';
import { customersWithInstancesQueryOptions } from '@/domains/customer-management';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';

describe('aggregated query cancellation', () => {
  it.each([
    ['customers', customersWithInstancesQueryOptions],
    ['releases', releaseManagementOverviewQueryOptions],
  ] as const)('cancels %s before the next cursor and does not cache a business error', async (field, options) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let calls = 0;
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
    server.use(http.post('*/api/graphql', async ({ request }) => {
      calls++;
      resolveStarted();
      await new Promise<void>((resolve) => request.signal.addEventListener('abort', () => resolve(), { once: true }));
      return HttpResponse.json({ data: { [field]: { hasMore: true, items: [], nextCursor: 'next' } } });
    }));
    const result = queryClient.fetchQuery(options as typeof customersWithInstancesQueryOptions);
    const caught = result.catch((error: unknown) => error);
    await started;
    await queryClient.cancelQueries({ queryKey: options.queryKey });
    expect(isCancelledError(await caught)).toBe(true);
    expect(calls).toBe(1);
    expect(queryClient.getQueryState(options.queryKey)?.error).toBeNull();
    queryClient.clear();
  });
});
