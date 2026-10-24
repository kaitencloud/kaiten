import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { UsageReportPage } from '@/api-client';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import type { InstanceAppModel } from '../../e2e/app/_support/model/instance-app-model';
import { BILLED_NOW } from '../../e2e/app/billing/billed-instances';
import { createBilledInstancesModel } from '../../e2e/app/instances/instances.scenarios';
import { server } from './msw-server';

// What the mocks standing in for the usage history answer: the journal of each
// entitlement of each instance, a page at a time and as files, within what the
// organization keeps, with the codes of the API. These read the answers off the
// wire, as the console does.

const API = 'http://api.test/api';
const REPORTS = '/instances/acme-production/entitlements/api-calls/usage/reports';

const install = (model: InstanceAppModel) => {
  const config: E2EMswConfig = { instances: model.serializeForMsw() };
  server.use(
    ...createMockHandlers(config, 'off', undefined, true),
    undeclaredApiRequest,
  );
};

const get = (path: string) => fetch(`${API}${path}`);

const page = async (path: string): Promise<UsageReportPage> =>
  (await get(path)).json();

const refusal = async (response: Response) =>
  (await response.json()) as {
    code?: string;
    errors?: Array<{ location?: string; value?: unknown }>;
  };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(BILLED_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the list of usage reports, as the mocks serve it', () => {
  it('serves the journal a hundred to a page, in the order it was accepted', async () => {
    install(createBilledInstancesModel());

    const first = await page(`${REPORTS}?limit=100`);
    const second = await page(`${REPORTS}?limit=100&afterSeq=${first.nextAfterSeq}`);

    expect(first.items).toHaveLength(100);
    expect(first.items[0].reportSeq).toBe(1);
    expect(first.nextAfterSeq).toBe(100);
    expect(second.items).toHaveLength(30);
    expect(second.items[0].reportSeq).toBe(101);
    expect(second.nextAfterSeq).toBeUndefined();
  });

  it('reads the last thirty days when no period is given, and a period up to its end excluded', async () => {
    install(createBilledInstancesModel());

    const narrowed = await page(
      `${REPORTS}?from=2026-09-20T00:00:00.000Z&to=2026-09-25T00:00:00.000Z`,
    );

    // One report every five hours, from the 20th at 01:00 to the 24th at 23:00.
    expect(narrowed.items).toHaveLength(24);
    for (const { reportedAt } of narrowed.items) {
      expect(reportedAt >= '2026-09-20T00:00:00.000Z').toBe(true);
      expect(reportedAt < '2026-09-25T00:00:00.000Z').toBe(true);
    }
  });

  it('refuses a period that begins before what is kept, with where the kept usage begins', async () => {
    install(createBilledInstancesModel());

    const response = await get(`${REPORTS}?from=2025-01-01T00:00:00.000Z`);
    const body = await refusal(response);

    expect(response.status).toBe(422);
    expect(body.code).toBe('ListUsageReports.OutsideRetention');
    expect(body.errors?.[0]).toMatchObject({
      location: 'query.from',
      value: '2025-04-07T12:00:00.000Z',
    });
  });

  it('moves the default period up to what is kept instead of refusing it', async () => {
    const model = createBilledInstancesModel();
    model.usageHistory.setRetentionStart('2026-09-20T00:00:00.000Z');
    install(model);

    const kept = await page(REPORTS);

    expect(kept.items.length).toBeGreaterThan(0);
    expect(kept.items.length).toBeLessThan(130);
    expect(kept.items[0].reportedAt >= '2026-09-20T00:00:00.000Z').toBe(true);
  });

  it('refuses a period that is empty, and one that ends before what is kept', async () => {
    install(createBilledInstancesModel());

    const empty = await get(
      `${REPORTS}?from=2026-09-25T00:00:00.000Z&to=2026-09-20T00:00:00.000Z`,
    );
    const before = await get(
      `${REPORTS}?from=2024-01-01T00:00:00.000Z&to=2025-01-01T00:00:00.000Z`,
    );

    expect((await refusal(empty)).code).toBe('ListUsageReports.InvalidRange');
    expect((await refusal(before)).code).toBe('ListUsageReports.OutsideRetention');
  });

  it('refuses an instance or an entitlement it does not know', async () => {
    install(createBilledInstancesModel());

    const instance = await get(
      '/instances/nowhere/entitlements/api-calls/usage/reports',
    );
    const entitlement = await get(
      '/instances/acme-production/entitlements/nothing/usage/reports',
    );

    expect(instance.status).toBe(404);
    expect((await refusal(instance)).code).toBe('ListUsageReports.InstanceNotFound');
    expect(entitlement.status).toBe(404);
    expect((await refusal(entitlement)).code).toBe(
      'ListUsageReports.EntitlementNotFound',
    );
  });

  it('refuses once with the problem a spec armed, then answers again', async () => {
    const model = createBilledInstancesModel();
    model.usageHistory.armProblem('listUsageReports', {
      code: 'ListUsageReports.Unavailable',
      detail: 'the usage journal is not available right now',
      status: 503,
    });
    install(model);

    expect((await get(REPORTS)).status).toBe(503);
    expect((await get(REPORTS)).status).toBe(200);
  });
});

describe('the exports of usage reports, as the mocks serve them', () => {
  it('writes every report of the period as a CSV, under the header of the API', async () => {
    install(createBilledInstancesModel());

    const response = await get(`${REPORTS}/export?format=csv`);
    const lines = (await response.text()).trim().split('\n');

    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(lines[0].split(',').slice(0, 4)).toEqual([
      'organization_id',
      'instance_id',
      'entitlement_id',
      'report_seq',
    ]);
    // Not a page: the whole journal of the period.
    expect(lines).toHaveLength(131);
  });

  it('writes one report to a line as NDJSON, and refuses a format it has not', async () => {
    install(createBilledInstancesModel());

    const ndjson = await get(`${REPORTS}/export?format=json`);
    const invalid = await get(`${REPORTS}/export?format=xml`);

    expect(ndjson.headers.get('content-type')).toContain('ndjson');
    expect((await ndjson.text()).trim().split('\n')).toHaveLength(130);
    expect(invalid.status).toBe(422);
    expect((await refusal(invalid)).code).toBe('ExportUsageReports.InvalidFormat');
  });

  it('exports at most 366 days of one entitlement, and refuses the rest', async () => {
    install(createBilledInstancesModel());

    const wide = await get(
      `${REPORTS}/export?from=2025-06-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z`,
    );
    const year = await get(
      `${REPORTS}/export?from=2025-10-02T00:00:00.000Z&to=2026-10-01T00:00:00.000Z`,
    );

    expect(wide.status).toBe(422);
    expect((await refusal(wide)).code).toBe('ExportUsageReports.RangeTooLarge');
    expect(year.status).toBe(200);
  });

  it('refuses an export that begins before what is kept, with where it begins', async () => {
    install(createBilledInstancesModel());

    const response = await get(`${REPORTS}/export?from=2025-01-01T00:00:00.000Z`);
    const body = await refusal(response);

    expect(response.status).toBe(422);
    expect(body.code).toBe('ExportUsageReports.OutsideRetention');
    expect(body.errors?.[0].value).toBe('2025-04-07T12:00:00.000Z');
  });

  it('exports at most 31 days of the whole organization, ordered by when the reports were made', async () => {
    install(createBilledInstancesModel());

    const wide = await get(
      '/usage/reports/export?from=2026-08-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z',
    );
    const month = await get(
      '/usage/reports/export?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z',
    );
    const lines = (await month.text()).trim().split('\n');

    expect(wide.status).toBe(422);
    expect((await refusal(wide)).code).toBe('ExportUsageReports.RangeTooLarge');
    // 103 of the 130 reports were accepted in September.
    expect(lines).toHaveLength(104);
  });

  it('narrows the export of the organization to an instance and an entitlement', async () => {
    install(createBilledInstancesModel());

    const other = await get(
      '/usage/reports/export?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z&instanceSlug=beta-staging',
    );
    const one = await get(
      '/usage/reports/export?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z&instanceSlug=acme-production&entitlementSlug=api-calls',
    );

    expect((await other.text()).trim().split('\n')).toHaveLength(1);
    expect((await one.text()).trim().split('\n')).toHaveLength(104);
  });
});
