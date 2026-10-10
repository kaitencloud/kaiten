import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleExportOrganizationUsageReports } from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`.
import '@/lib/api/bootstrap';
import { downloadUsageChunk } from '../download-usage-chunk';

const downloadBlob = vi.hoisted(() => vi.fn());

// The browser is the edge: what it was handed is what the file would hold.
vi.mock('@/lib/download-blob', () => ({ downloadBlob }));

const MARCH = {
  from: '2027-03-01T00:00:00.000Z',
  key: '2027-03',
  to: '2027-04-01T00:00:00.000Z',
};
const NOW = new Date('2027-04-02T09:00:00.000Z');

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

const outsideRetention = (start: string) =>
  HttpResponse.json(
    {
      code: 'ExportUsageReports.OutsideRetention',
      detail: `the usage history is kept from ${start}: from must not be earlier`,
      errors: [
        { location: 'query.from', message: 'retentionStart', value: start },
      ],
      status: 422,
    },
    { status: 422 },
  );

describe('saving a month of usage', () => {
  it('asks for the CSV of the month, for every instance, and hands it to the browser under a name of its own', async () => {
    const asked: URL[] = [];
    server.use(
      handleExportOrganizationUsageReports(({ request }) => {
        asked.push(new URL(request.url));

        return new HttpResponse('report_seq\n1\n', {
          headers: { 'Content-Type': 'text/csv' },
        });
      }),
    );

    await downloadUsageChunk(MARCH, NOW);

    expect(asked).toHaveLength(1);
    expect(asked[0].searchParams.get('format')).toBe('csv');
    expect(asked[0].searchParams.get('from')).toBe(MARCH.from);
    expect(asked[0].searchParams.get('to')).toBe(MARCH.to);
    // Every instance and entitlement: no filter.
    for (const filter of ['instanceSlug', 'entitlementSlug']) {
      expect(asked[0].searchParams.has(filter), filter).toBe(false);
    }
    await expect(downloadBlob.mock.results[0].value).resolves.toEqual({
      content: 'report_seq\n1\n',
      filename: 'usage-2027-03-20270402T090000Z.csv',
    });
  });

  it('reads the oldest month from where the kept usage begins, when the month begins before it', async () => {
    const asked: string[] = [];
    server.use(
      handleExportOrganizationUsageReports(({ request }) => {
        const from = new URL(request.url).searchParams.get('from') ?? '';
        asked.push(from);

        return from === MARCH.from
          ? outsideRetention('2027-03-09T22:14:07Z')
          : new HttpResponse('report_seq\n41\n', {
              headers: { 'Content-Type': 'text/csv' },
            });
      }),
    );

    await downloadUsageChunk(MARCH, NOW);

    expect(asked).toEqual([MARCH.from, '2027-03-09T22:14:07Z']);
    expect(downloadBlob).toHaveBeenCalledTimes(2);
    await expect(downloadBlob.mock.results[1].value).resolves.toMatchObject({
      content: 'report_seq\n41\n',
    });
  });

  it('does not ask a second time for a month that ends before the kept usage begins: the refusal says so', async () => {
    let calls = 0;
    server.use(
      handleExportOrganizationUsageReports(() => {
        calls += 1;

        return outsideRetention('2027-05-01T00:00:00Z');
      }),
    );

    await expect(downloadUsageChunk(MARCH, NOW)).rejects.toMatchObject({
      status: 422,
    });
    expect(calls).toBe(1);
  });

  it('asks a second time once only: a refusal of the second read is the answer', async () => {
    let calls = 0;
    server.use(
      handleExportOrganizationUsageReports(() => {
        calls += 1;

        return outsideRetention('2027-03-09T22:14:07Z');
      }),
    );

    await expect(downloadUsageChunk(MARCH, NOW)).rejects.toMatchObject({
      status: 422,
    });
    expect(calls).toBe(2);
  });

  it('lets any other refusal of the API reach the caller, which shows it', async () => {
    server.use(
      handleExportOrganizationUsageReports(() =>
        HttpResponse.json(
          { code: 'Billing.Disabled', detail: 'billing is off', status: 403 },
          { status: 403 },
        ),
      ),
    );

    await expect(downloadUsageChunk(MARCH, NOW)).rejects.toMatchObject({
      status: 403,
    });
    expect(downloadBlob).toHaveBeenCalledTimes(1);
  });
});
