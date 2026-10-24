import { QueryClient } from '@tanstack/react-query';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleExportUsageReports,
  handleListUsageReports,
} from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`.
import '@/lib/api/bootstrap';
import { downloadUsageHistory, usageHistoryFilename } from '../download-usage-history';
import { usageHistoryQueryOptions } from '../usage-history-query-options';

const downloadBlob = vi.hoisted(() => vi.fn());

// The browser is the edge: what it was handed is what the file would hold.
vi.mock('@/lib/download-blob', () => ({ downloadBlob }));

const report = (reportSeq: number) => ({
  aggregationMethod: 'sum',
  behavior: 'append' as const,
  delta: '10',
  entitlementId: 'ent-1',
  eventCountAfter: reportSeq,
  instanceId: 'ins-1',
  licenseId: 'lic-1',
  overageDelta: '0',
  reportSeq,
  reportedAt: '2027-03-02T00:00:00.000Z',
  reportedValue: '10',
  valueAfter: String(reportSeq * 10),
  valueBefore: String((reportSeq - 1) * 10),
});

describe('the pages of the usage history', () => {
  it('reads by report number: no number for the first page, the one the API gave for each next', async () => {
    const asked: Array<{ params: Record<string, unknown>; url: URL }> = [];
    server.use(
      handleListUsageReports(({ params, request }) => {
        const url = new URL(request.url);
        asked.push({ params, url });

        return HttpResponse.json(
          url.searchParams.has('afterSeq')
            ? { items: [report(3)] }
            : { items: [report(1), report(2)], nextAfterSeq: 2 },
        );
      }),
    );
    const client = new QueryClient();
    const options = usageHistoryQueryOptions('globex-production', 'api-calls', {
      from: '2027-03-01T00:00:00.000Z',
      to: '2027-04-01T00:00:00.000Z',
    });

    const first = await client.fetchInfiniteQuery({ ...options, pages: 2 });

    expect(first.pages.flatMap((page) => page.items.map((item) => item.reportSeq))).toEqual([
      1, 2, 3,
    ]);
    expect(asked).toHaveLength(2);
    expect(asked[0].params).toMatchObject({
      entitlementSlug: 'api-calls',
      instanceSlug: 'globex-production',
    });
    expect(asked[0].url.searchParams.has('afterSeq')).toBe(false);
    expect(asked[0].url.searchParams.get('from')).toBe('2027-03-01T00:00:00.000Z');
    expect(asked[0].url.searchParams.get('to')).toBe('2027-04-01T00:00:00.000Z');
    expect(asked[0].url.searchParams.get('limit')).toBe('100');
    expect(asked[1].url.searchParams.get('afterSeq')).toBe('2');
    // The period of the first page is the one of the next.
    expect(asked[1].url.searchParams.get('from')).toBe('2027-03-01T00:00:00.000Z');
  });

  it('leaves an open end open, for the API to default', async () => {
    const asked: URL[] = [];
    server.use(
      handleListUsageReports(({ request }) => {
        asked.push(new URL(request.url));

        return HttpResponse.json({ items: [] });
      }),
    );

    await new QueryClient().fetchInfiniteQuery(
      usageHistoryQueryOptions('globex-production', 'api-calls', {}),
    );

    expect(asked[0].searchParams.has('from')).toBe(false);
    expect(asked[0].searchParams.has('to')).toBe(false);
  });

  it('keeps one cache for each period of each pair, and tells it apart from a plain read', () => {
    const key = (slug: string, from?: string) =>
      JSON.stringify(
        usageHistoryQueryOptions('globex-production', slug, { from }).queryKey,
      );

    expect(key('api-calls')).not.toBe(key('seats'));
    expect(key('api-calls')).not.toBe(key('api-calls', '2027-03-01T00:00:00.000Z'));
    expect(key('api-calls')).toContain('"_infinite":true');
  });

  it('does not retry a refusal: it is the answer', () => {
    const options = usageHistoryQueryOptions('globex-production', 'api-calls', {});

    expect(options.retry).toBe(false);
    expect(options.retryOnMount).toBe(false);
  });
});

describe('the name of the CSV of a history', () => {
  it('says the instance, the entitlement and the UTC moment of the download', () => {
    expect(
      usageHistoryFilename(
        'globex-production',
        'api-calls',
        new Date('2027-03-04T15:30:05.000Z'),
      ),
    ).toBe('usage-globex-production-api-calls-20270304T153005Z.csv');
  });
});

describe('saving the usage history', () => {
  beforeEach(() => {
    downloadBlob.mockReset();
    // The real function makes the request it is given and saves what comes back.
    downloadBlob.mockImplementation(
      async (request: () => Promise<{ data: Blob }>, filename: string) => ({
        content: await (await request()).data.text(),
        filename,
      }),
    );
  });

  it('asks the API for the CSV of the period, and hands what it sent to the browser under a name of its own', async () => {
    const asked: Array<{ params: Record<string, unknown>; url: URL }> = [];
    server.use(
      handleExportUsageReports(({ params, request }) => {
        asked.push({ params, url: new URL(request.url) });

        return new HttpResponse('report_seq,delta\n1,10\n', {
          headers: { 'Content-Type': 'text/csv' },
        });
      }),
    );

    await downloadUsageHistory(
      'globex-production',
      'api-calls',
      { from: '2027-03-01T00:00:00.000Z', to: '2027-03-31T00:00:00.000Z' },
      new Date('2027-04-01T09:00:00.000Z'),
    );

    expect(asked).toHaveLength(1);
    expect(asked[0].params).toMatchObject({
      entitlementSlug: 'api-calls',
      instanceSlug: 'globex-production',
    });
    expect(asked[0].url.searchParams.get('format')).toBe('csv');
    expect(asked[0].url.searchParams.get('from')).toBe('2027-03-01T00:00:00.000Z');
    expect(asked[0].url.searchParams.get('to')).toBe('2027-03-31T00:00:00.000Z');
    await expect(downloadBlob.mock.results[0].value).resolves.toEqual({
      content: 'report_seq,delta\n1,10\n',
      filename: 'usage-globex-production-api-calls-20270401T090000Z.csv',
    });
  });

  it('lets a refusal of the API reach the caller, which shows it', async () => {
    server.use(
      handleExportUsageReports(() =>
        HttpResponse.json(
          {
            code: 'ExportUsageReports.RangeTooLarge',
            detail: 'the range spans more than 366 days; split it',
            status: 422,
          },
          { status: 422 },
        ),
      ),
    );

    await expect(
      downloadUsageHistory('globex-production', 'api-calls', {}),
    ).rejects.toMatchObject({ status: 422 });
  });
});
