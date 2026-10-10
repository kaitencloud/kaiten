import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vite-plus/test';
import { listUsageReportsQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { usageReportPagesQueryOptions } from '../queries';

const queryKey = listUsageReportsQueryKey({
  path: { entitlementSlug: 'api-calls', instanceSlug: 'globex' },
});

const page = (seqs: number[], nextAfterSeq?: number) => ({
  items: seqs.map((reportSeq) => ({ reportSeq })) as never[],
  nextAfterSeq,
});

describe('usageReportPagesQueryOptions', () => {
  it('keeps the key the generated options give the operation, marked as a paged read', () => {
    const options = usageReportPagesQueryOptions({
      fetchPage: async () => page([]),
      queryKey,
    });

    expect(options.queryKey).toEqual([{ ...queryKey[0], _infinite: true }]);
  });

  it('reads the first page after nothing, and each next one after the number the last page names', async () => {
    const afterSeqs: Array<number | undefined> = [];
    const pages = [page([1, 2], 2), page([3, 4], 4), page([5])];
    const options = usageReportPagesQueryOptions({
      fetchPage: async (afterSeq) => {
        afterSeqs.push(afterSeq);

        return pages[afterSeqs.length - 1];
      },
      queryKey,
    });
    const client = new QueryClient();

    const data = await client.fetchInfiniteQuery({ ...options, pages: 3 });

    expect(afterSeqs).toEqual([undefined, 2, 4]);
    expect(data.pages).toHaveLength(3);
    expect(options.getNextPageParam(pages[2], pages, undefined, [])).toBeUndefined();
  });

  it('starts after report 0 when it is told to', async () => {
    const fetchPage = vi.fn(async (_afterSeq: number | undefined) => page([1]));
    const options = usageReportPagesQueryOptions({
      fetchPage,
      initialPageParam: 0,
      queryKey,
    });

    await new QueryClient().fetchInfiniteQuery(options);

    expect(fetchPage.mock.calls[0][0]).toBe(0);
  });

  it('never retries a read, and does not read again by itself when the screen mounts on a refusal', () => {
    const options = usageReportPagesQueryOptions({
      fetchPage: async () => page([]),
      queryKey,
    });

    expect(options.retry).toBe(false);
    expect(options.retryOnMount).toBe(false);
  });
});
