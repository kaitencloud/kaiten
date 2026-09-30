import { describe, expect, it, vi } from 'vite-plus/test';
import { listEntitlementsOptions } from '@/api-client/@tanstack/react-query.gen';
import { allEntitlementsOptions } from '../all-pages-query-options';

const { listEntitlementsMock } = vi.hoisted(() => ({
  listEntitlementsMock: vi.fn(),
}));

vi.mock('@/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api-client')>()),
  listEntitlements: listEntitlementsMock,
}));

describe('allEntitlementsOptions', () => {
  it('reads every page under the generated first-page query key', async () => {
    listEntitlementsMock
      .mockResolvedValueOnce({
        data: { hasMore: true, items: [{ id: 'e1' }], nextCursor: 'c1' },
      })
      .mockResolvedValueOnce({
        data: { hasMore: false, items: [{ id: 'e2' }] },
      });

    const options = allEntitlementsOptions();

    // Invalidations and cache updates target the generated key.
    expect(options.queryKey).toEqual(listEntitlementsOptions().queryKey);

    const result = await options.queryFn?.({
      signal: new AbortController().signal,
    } as never);

    expect(result).toEqual({ hasMore: false, items: [{ id: 'e1' }, { id: 'e2' }] });
    expect(listEntitlementsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ query: { cursor: undefined, limit: 200 } }),
    );
    expect(listEntitlementsMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ query: { cursor: 'c1', limit: 200 } }),
    );
  });
});
