import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type {
  EntitlementUsage,
  PageEntitlementResource,
  UsageReportPage,
} from '@/api-client';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import { createResourcesInstancesModel } from '../../e2e/app/instances/instances.scenarios';
import { BillingProblem } from '../../e2e/app/_support/model/billing-problem';
import { isResourceKey } from '../../e2e/app/_support/model/instance-entitlement-resources';
import { InstanceAppModel } from '../../e2e/app/_support/model/instance-app-model';
import { server } from './msw-server';

// What the mocks standing in for the entitlements that count per resource answer, computed
// from the counters and never read off a fixed row: the value and the `resources` block of
// the entitlement's own usage, the four routes below it, the ceiling of resources, the
// idempotency of a report per resource and the journal rows a report leaves, with the codes
// of the API. These read the answers off the wire, as the console does. The world is Nagare's:
// `sources-per-competitor` is four for each competitor, and Stigg stands at 2, Schematic at 4
// (its limit), Paid at 3 and fifty-seven others at 1, which makes sixty.

const API = 'http://api.test/api';
const PAIR = '/instances/nagare-production/entitlements/sources-per-competitor';
const RESOURCES = `${PAIR}/resources`;

const install = (model: InstanceAppModel = createResourcesInstancesModel()) => {
  const config: E2EMswConfig = { instances: model.serializeForMsw() };
  server.use(
    ...createMockHandlers(config, 'off', undefined, true),
    undeclaredApiRequest,
  );

  return model;
};

type Problem = {
  code?: string;
  errors?: Array<{ location?: string; value?: unknown }>;
};

const send = (
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
    method,
  });

const report = (
  resource: string,
  value: number,
  behavior: 'append' | 'set' = 'append',
  headers?: Record<string, string>,
) =>
  send(
    'POST',
    `${RESOURCES}/${encodeURIComponent(resource)}/usage`,
    { behavior, value: { type: 'number', value } },
    headers,
  );

const problem = async (response: Response) => (await response.json()) as Problem;

/** The usage rows of the instance, by entitlement. */
const usageRows = async () => {
  const rows = (await (
    await send('GET', '/instances/nagare-production/entitlements/usage')
  ).json()) as EntitlementUsage[];

  return Object.fromEntries(rows.map((row) => [row.entitlementSlug, row]));
};

const summary = async () => {
  const row = (await usageRows())['sources-per-competitor'];

  return {
    highest: row.value.type === 'number' ? row.value.value : undefined,
    resources: row.resources,
  };
};

const resourcePage = async (query = ''): Promise<PageEntitlementResource> =>
  (await send('GET', `${RESOURCES}${query}`)).json();

const counterOf = async (resource: string) => {
  const response = await send(
    'GET',
    `${RESOURCES}/${encodeURIComponent(resource)}/usage`,
  );
  const usage = (await response.json()) as EntitlementUsage;

  return usage.value.type === 'number' ? usage.value.value : undefined;
};

describe('the usage of an entitlement that counts per resource', () => {
  it('reads as its highest counter, with how many resources hold one and how many are at the limit', async () => {
    install();

    const row = (await usageRows())['sources-per-competitor'];

    expect(row.value).toMatchObject({ type: 'number', value: 4 });
    expect(row.limit).toEqual({ type: 'number', value: 4 });
    expect(row.resources).toEqual({ atLimit: 1, count: 60 });
    // The entitlement that counts per instance has no block, and keeps its own value.
    const calls = (await usageRows())['api-calls'];
    expect(calls.resources).toBeUndefined();
    expect(calls.value).toMatchObject({ value: 120 });
  });

  it('follows a report: the highest counter moves, and so does what is at the limit', async () => {
    install();

    expect((await report('paid', 1)).status).toBe(200);
    expect(await summary()).toEqual({
      highest: 4,
      resources: { atLimit: 2, count: 60 },
    });

    // A resource nothing was reported for is created by its first accepted report.
    expect((await report('newco', 2)).status).toBe(200);
    expect(await summary()).toEqual({
      highest: 4,
      resources: { atLimit: 2, count: 61 },
    });
  });

  it('falls back to the next highest counter when the highest is lowered or forgotten', async () => {
    install();

    // Schematic lowered by a set: the highest is now Paid's 3.
    await report('schematic', 1, 'set');
    expect(await summary()).toMatchObject({
      highest: 3,
      resources: { atLimit: 0 },
    });

    // Paid forgotten: Stigg's 2.
    expect((await send('DELETE', `${RESOURCES}/paid`)).status).toBe(204);
    expect(await summary()).toEqual({
      highest: 2,
      resources: { atLimit: 0, count: 59 },
    });
  });

  it('has no counter in a window that closed, which reads zero', async () => {
    const model = new InstanceAppModel({
      customers: createResourcesInstancesModel().listCustomers(),
      entitlementUsagesByInstance: {
        'nagare-production': [
          {
            currentPeriodEnd: '2026-04-01T00:00:00.000Z',
            currentPeriodStart: '2026-03-01T00:00:00.000Z',
            entitlementId: 'entitlement-sources-per-competitor',
            entitlementSlug: 'sources-per-competitor',
            licenseId: 'license-pro',
            licenseSlug: 'pro',
            limit: { type: 'number', value: 4 },
            limitCapExceededOveragePercent: 0,
            source: 'license',
            value: { type: 'number', value: 0 },
          },
        ],
      },
      instances: createResourcesInstancesModel().listInstances(),
      licenseEntitlements: createResourcesInstancesModel().getLicenseEntitlements(
        'pro',
      ),
      licenses: createResourcesInstancesModel().listLicenses(),
      perResource: { 'sources-per-competitor': { aggregationMethod: 'SUM' } },
      resources: {
        'nagare-production': {
          'sources-per-competitor': [
            { periodStart: '2026-02-01T00:00:00.000Z', resourceKey: 'old', value: 4 },
            { periodStart: '2026-03-01T00:00:00.000Z', resourceKey: 'new', value: 2 },
          ],
        },
      },
    });
    install(model);

    // The window the pair is in holds one counter: the other is kept, and reads zero.
    expect(await summary()).toEqual({
      highest: 2,
      resources: { atLimit: 0, count: 2 },
    });
    expect(await counterOf('old')).toBe(0);
    expect(
      (await resourcePage()).items.map(({ resourceKey, value }) => [
        resourceKey,
        value.value,
      ]),
    ).toEqual([
      ['new', 2],
      ['old', 0],
    ]);
    // A report on the stale one starts it again in the window, from zero.
    await report('old', 1);
    expect(await counterOf('old')).toBe(1);
    expect(await summary()).toMatchObject({ highest: 2, resources: { count: 2 } });
  });

  it('sees the limit the instance has, which an add-on or an exception changes for every resource', async () => {
    const model = install();

    model.applyAddonContributions('nagare-production', [
      {
        addonEntitlementId: 'addon-entitlement-1',
        addonId: 'addon-1',
        attachedAt: '2026-03-01T00:00:00.000Z',
        behavior: 'ADD',
        entitlementSlug: 'sources-per-competitor',
        instanceAddonId: 'instance-addon-1',
        quantity: 1,
        value: 2,
      },
    ]);
    install(model);

    const row = (await usageRows())['sources-per-competitor'];
    expect(row.limit).toEqual({ type: 'number', value: 6 });
    // Nobody is at six, so none is at the limit any more: Schematic may count to 6.
    expect(row.resources).toEqual({ atLimit: 0, count: 60 });
    expect((await report('schematic', 2)).status).toBe(200);
    expect(await counterOf('schematic')).toBe(6);
    expect((await report('schematic', 1)).status).toBe(409);
  });
});

describe('a report of a resource', () => {
  it('counts for the resource alone, against the limit of the entitlement', async () => {
    install();

    // Stigg stands at 2: two more reach the limit, and a third is refused.
    const first = await report('stigg', 2);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      limit: { type: 'number', value: 4 },
      resourceKey: 'stigg',
      transactionId: null,
      value: { event_count: 3, type: 'number', value: 4 },
    });
    const refused = await report('stigg', 1);
    expect(refused.status).toBe(409);
    expect((await problem(refused)).code).toBe(
      'ReportEntitlementUsageMetric.ThresholdExceeded',
    );
    // Nobody else's counter moved.
    expect(await counterOf('stigg')).toBe(4);
    expect(await counterOf('paid')).toBe(3);
    expect((await report('paid', 1)).status).toBe(200);
  });

  it('creates no counter when it is refused', async () => {
    install();

    const refused = await report('too-big', 5);

    expect(refused.status).toBe(409);
    expect((await summary()).resources).toEqual({ atLimit: 1, count: 60 });
    expect(await counterOf('too-big')).toBe(0);
    expect(
      (await resourcePage()).items.map(({ resourceKey }) => resourceKey),
    ).not.toContain('too-big');
  });

  it('keeps the keys as they were written: Stigg and stigg are two resources', async () => {
    install();

    await report('Stigg', 1);

    expect(await counterOf('Stigg')).toBe(1);
    expect(await counterOf('stigg')).toBe(2);
    expect((await summary()).resources?.count).toBe(61);
  });

  it('adds and removes with append, and corrects with set', async () => {
    install();

    await report('stigg', 1);
    expect(await counterOf('stigg')).toBe(3);
    await report('stigg', -1);
    expect(await counterOf('stigg')).toBe(2);
    await report('stigg', 4, 'set');
    expect(await counterOf('stigg')).toBe(4);
    // A set that lands above the limit is refused as an append would be.
    expect((await report('stigg', 5, 'set')).status).toBe(409);
    expect(await counterOf('stigg')).toBe(4);
  });

  it('refuses a key that is not one, a value that is not a number and a behavior that is not one', async () => {
    install();

    for (const key of ['a b', 'a'.repeat(129), 'é', 'a/b']) {
      const response = await report(key, 1);

      expect(response.status, key).toBe(422);
      expect(await problem(response), key).toMatchObject({
        code: 'ReportEntitlementUsageMetric.InvalidResourceKey',
        errors: [{ location: 'path.resourceKey' }],
      });
    }
    const ai = await send('POST', `${RESOURCES}/stigg/usage`, {
      behavior: 'append',
      value: { aiUsage: {}, type: 'ai_usage' },
    });
    expect((await problem(ai)).code).toBe(
      'ReportEntitlementUsageMetric.InvalidValueType',
    );
    const behavior = await send('POST', `${RESOURCES}/stigg/usage`, {
      value: { type: 'number', value: 1 },
    });
    expect((await problem(behavior)).code).toBe(
      'ReportEntitlementUsageMetric.InvalidBehavior',
    );
    const header = await report('stigg', 1, 'append', {
      'Idempotency-Key': 'a b',
    });
    expect((await problem(header)).code).toBe(
      'ReportEntitlementUsageMetric.InvalidTransactionId',
    );
    // Nothing of it was counted.
    expect(await counterOf('stigg')).toBe(2);
  });

  it('reads the key the way the API does: a segment is decoded once', async () => {
    install();

    // A browser writes comp:123 as comp%3A123.
    const created = await send('POST', `${RESOURCES}/comp%3A123/usage`, {
      behavior: 'append',
      value: { type: 'number', value: 1 },
    });

    expect(created.status).toBe(200);
    expect(await counterOf('comp:123')).toBe(1);
    // A percent sign that survives the decoding is no part of a key.
    const double = await send('POST', `${RESOURCES}/a%2541/usage`, {
      behavior: 'append',
      value: { type: 'number', value: 1 },
    });
    expect((await problem(double)).code).toBe(
      'ReportEntitlementUsageMetric.InvalidResourceKey',
    );
  });

  it('is refused on an entitlement that counts per instance, and unknown pairs are not found', async () => {
    install();

    const instance = await send(
      'POST',
      '/instances/nagare-production/entitlements/api-calls/resources/stigg/usage',
      { behavior: 'append', value: { type: 'number', value: 1 } },
    );
    expect(instance.status).toBe(422);
    expect(await problem(instance)).toMatchObject({
      code: 'ReportEntitlementUsageMetric.ResourceKeyNotAllowed',
      errors: [{ location: 'path.resourceKey', value: 'stigg' }],
    });
    for (const path of [
      '/instances/nowhere/entitlements/sources-per-competitor/resources/stigg/usage',
      '/instances/nagare-production/entitlements/ghost/resources/stigg/usage',
    ]) {
      const missing = await send('POST', path, {
        behavior: 'append',
        value: { type: 'number', value: 1 },
      });
      expect(missing.status, path).toBe(404);
      expect((await problem(missing)).code).toBe(
        'ReportEntitlementUsageMetric.ContextNotFound',
      );
    }
  });

  it('folds with the aggregation method of the entitlement', async () => {
    const world = createResourcesInstancesModel({ competitors: 3 });
    const folded = async (aggregationMethod: 'AVERAGE' | 'COUNT' | 'LATEST' | 'MAX' | 'MIN') => {
      const model = new InstanceAppModel({
        customers: world.listCustomers(),
        entitlementUsagesByInstance: {
          'nagare-production': [
            {
              entitlementId: 'entitlement-sources-per-competitor',
              entitlementSlug: 'sources-per-competitor',
              licenseId: 'license-pro',
              licenseSlug: 'pro',
              limit: { type: 'number', value: -1 },
              limitCapExceededOveragePercent: -1,
              source: 'license',
              value: { type: 'number', value: 0 },
            },
          ],
        },
        instances: world.listInstances(),
        licenseEntitlements: world.getLicenseEntitlements('pro'),
        licenses: world.listLicenses(),
        perResource: { 'sources-per-competitor': { aggregationMethod } },
      });
      install(model);
      for (const value of [10, 4, 7]) {
        await report('stigg', value);
      }

      return counterOf('stigg');
    };

    // The same three reports under each method.
    expect(await folded('COUNT')).toBe(3);
    expect(await folded('MAX')).toBe(10);
    expect(await folded('MIN')).toBe(0);
    expect(await folded('LATEST')).toBe(7);
    expect(await folded('AVERAGE')).toBe(7);
  });

  it('is applied once under the same key on the same resource, and counts again under another resource', async () => {
    install();
    const key = { 'Idempotency-Key': 'source-created:9f2c' };

    const first = await report('stigg', 1, 'append', key);
    const replay = await report('stigg', 1, 'append', key);
    const other = await report('paid', 1, 'append', key);

    expect(first.headers.get('Idempotent-Replayed')).toBeNull();
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(await replay.json()).toMatchObject({
      resourceKey: 'stigg',
      source: null,
      transactionId: 'source-created:9f2c',
      value: { type: 'number', value: 3 },
    });
    // The replay counted nothing: one business event feeds two resources under one key.
    expect(await counterOf('stigg')).toBe(3);
    expect(other.headers.get('Idempotent-Replayed')).toBeNull();
    expect(await counterOf('paid')).toBe(4);
  });

  it('refuses the same key with another value, and does not consume the key of a refused report', async () => {
    install();
    const key = { 'Idempotency-Key': 'event-1' };

    await report('stigg', 1, 'append', key);
    const reused = await report('stigg', 2, 'append', key);

    expect(reused.status).toBe(409);
    expect(await problem(reused)).toMatchObject({
      code: 'ReportEntitlementUsageMetric.TransactionIdReused',
      errors: [{ location: 'header.Idempotency-Key' }],
    });
    // A refused report leaves no row, so its key is free for the correction.
    const refused = await report('schematic', 1, 'append', { 'Idempotency-Key': 'event-2' });
    expect(refused.status).toBe(409);
    await report('schematic', -1, 'append', { 'Idempotency-Key': 'event-2' });
    expect(await counterOf('schematic')).toBe(3);
  });
});

// A dot segment is normalized away by the client before the request leaves, so `.` and `..`
// never reach the API as a key: the model refuses them all the same, for what sends them raw.
describe('the keys that no address can carry', () => {
  it('are no keys, whatever the route that is asked', () => {
    expect(['.', '..'].map(isResourceKey)).toEqual([false, false]);
    expect(['a.', '.a', '...', 'a..b', 'a:b_c-d'].map(isResourceKey)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);

    const model = createResourcesInstancesModel();
    const refused = (action: () => unknown) => {
      try {
        action();
      } catch (error) {
        return error instanceof BillingProblem ? error.code : error;
      }
      return undefined;
    };
    const body = { behavior: 'append', value: { type: 'number', value: 1 } } as const;
    const pair = ['nagare-production', 'sources-per-competitor'] as const;

    for (const key of ['.', '..']) {
      expect(
        refused(() => model.reportResourceUsage(...pair, key, body, { sent: false })),
      ).toBe('ReportEntitlementUsageMetric.InvalidResourceKey');
      expect(refused(() => model.getEntitlementResourceUsage(...pair, key))).toBe(
        'GetEntitlementResourceUsage.InvalidResourceKey',
      );
      expect(refused(() => model.deleteEntitlementResource(...pair, key))).toBe(
        'DeleteEntitlementResource.InvalidResourceKey',
      );
    }
  });
});

describe('the ceiling of resources', () => {
  it('refuses the report that would open one more, and lets the others count and free a slot', async () => {
    const model = createResourcesInstancesModel({ competitors: 3 });
    model.resources.setMaxResources(3);
    install(model);

    const refused = await report('fourth', 1);
    expect(refused.status).toBe(422);
    expect(await problem(refused)).toMatchObject({
      code: 'ReportEntitlementUsageMetric.ResourceLimitReached',
      errors: [{ location: 'path.resourceKey', value: 'fourth' }],
    });
    // A resource that holds a counter always reports, whether the limit lets it count or not.
    expect((await report('schematic', 1)).status).toBe(409);
    expect((await report('schematic', -1)).status).toBe(200);
    // Forgetting one makes room.
    await send('DELETE', `${RESOURCES}/paid`);
    expect((await report('fourth', 1)).status).toBe(200);
    expect((await summary()).resources?.count).toBe(3);
  });
});

describe('the resources of an entitlement', () => {
  it('lists the keys in bytewise order, a page at a time, each with its counter', async () => {
    install();

    const first = await resourcePage('?limit=50');
    const second = await resourcePage(`?limit=50&cursor=${first.nextCursor}`);

    expect(first.items).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(first.items[0]).toEqual({
      resourceKey: 'competitor-01',
      value: { event_count: 1, type: 'number', value: 1 },
    });
    expect(second.items.map(({ resourceKey }) => resourceKey)).toEqual([
      ...Array.from(
        { length: 7 },
        (_, index) => `competitor-${String(index + 51).padStart(2, '0')}`,
      ),
      'paid',
      'schematic',
      'stigg',
    ]);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeUndefined();
    // Upper case sorts before lower case, as bytes do.
    await report('Zeta', 1);
    expect((await resourcePage('?limit=1')).items[0].resourceKey).toBe('Zeta');
  });

  it('pages 50 at a time by default and 200 at most', async () => {
    install(createResourcesInstancesModel({ competitors: 250 }));

    expect((await resourcePage()).items).toHaveLength(50);
    expect((await resourcePage('?limit=1000')).items).toHaveLength(200);
  });

  it('refuses a cursor that is not one, and what it does not know', async () => {
    install();

    const cursor = await send('GET', `${RESOURCES}?cursor=nope`);
    expect(cursor.status).toBe(400);
    expect((await problem(cursor)).code).toBe(
      'ListEntitlementResources.InvalidCursor',
    );
    const instance = await send(
      'GET',
      '/instances/nowhere/entitlements/sources-per-competitor/resources',
    );
    expect(instance.status).toBe(404);
    expect((await problem(instance)).code).toBe(
      'ListEntitlementResources.InstanceNotFound',
    );
    const entitlement = await send(
      'GET',
      '/instances/nagare-production/entitlements/ghost/resources',
    );
    expect((await problem(entitlement)).code).toBe(
      'ListEntitlementResources.EntitlementNotFound',
    );
    const perInstance = await send(
      'GET',
      '/instances/nagare-production/entitlements/api-calls/resources',
    );
    expect(perInstance.status).toBe(422);
    expect((await problem(perInstance)).code).toBe(
      'ListEntitlementResources.NotPerResource',
    );
  });
});

describe('the usage of one resource', () => {
  it('reads zero for a resource nothing was reported for, so that a check before creating works', async () => {
    install();

    const response = await send('GET', `${RESOURCES}/nobody/usage`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      entitlementSlug: 'sources-per-competitor',
      limit: { type: 'number', value: 4 },
      resourceKey: 'nobody',
      value: { type: 'number', value: 0 },
    });
    // It creates nothing.
    expect((await summary()).resources?.count).toBe(60);
  });

  it('reads the counter of a resource, without the block of the entitlement', async () => {
    install();

    const usage = (await (
      await send('GET', `${RESOURCES}/schematic/usage`)
    ).json()) as EntitlementUsage;

    expect(usage.value).toMatchObject({ event_count: 4, value: 4 });
    expect(usage.resources).toBeUndefined();
  });

  it('is refused for a key that is not one, an entitlement that counts per instance and one nothing grants', async () => {
    install();

    const key = await send('GET', `${RESOURCES}/${encodeURIComponent('a b')}/usage`);
    expect((await problem(key)).code).toBe(
      'GetEntitlementResourceUsage.InvalidResourceKey',
    );
    const perInstance = await send(
      'GET',
      '/instances/nagare-production/entitlements/api-calls/resources/stigg/usage',
    );
    expect(perInstance.status).toBe(422);
    expect((await problem(perInstance)).code).toBe(
      'GetEntitlementResourceUsage.NotPerResource',
    );
  });
});

describe('the forgetting of a resource', () => {
  it('answers 204, forgets the counter and is idempotent', async () => {
    install();

    expect((await send('DELETE', `${RESOURCES}/stigg`)).status).toBe(204);
    expect((await send('DELETE', `${RESOURCES}/stigg`)).status).toBe(204);

    expect(await counterOf('stigg')).toBe(0);
    expect((await summary()).resources?.count).toBe(59);
  });

  it('writes no journal row and keeps what the reports of the resource did', async () => {
    install();
    const reports = async (query = '') =>
      (await (
        await send('GET', `${PAIR}/usage/reports${query}`)
      ).json()) as UsageReportPage;
    const before = (await reports()).items.length;

    await send('DELETE', `${RESOURCES}/stigg`);

    const after = await reports();
    expect(after.items).toHaveLength(before);
    expect(
      (await reports('?resourceKey=stigg')).items.map(({ reportSeq }) => reportSeq),
    ).toEqual([1, 3]);
  });

  it('is refused for a key that is not one, for an entitlement that counts per instance and for a pair that is not there', async () => {
    install();

    const key = await send('DELETE', `${RESOURCES}/${encodeURIComponent('a b')}`);
    expect((await problem(key)).code).toBe(
      'DeleteEntitlementResource.InvalidResourceKey',
    );
    const perInstance = await send(
      'DELETE',
      '/instances/nagare-production/entitlements/api-calls/resources/stigg',
    );
    expect((await problem(perInstance)).code).toBe(
      'DeleteEntitlementResource.NotPerResource',
    );
    const missing = await send(
      'DELETE',
      '/instances/nowhere/entitlements/sources-per-competitor/resources/stigg',
    );
    expect(missing.status).toBe(404);
    expect((await problem(missing)).code).toBe(
      'DeleteEntitlementResource.ContextNotFound',
    );
  });
});

describe('the journal of a report of a resource', () => {
  // A report is dated on receipt and a read excludes what is dated at the instant it is made.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const later = () => vi.setSystemTime(Date.now() + 1_000);
  const journal = async (query = '') =>
    (await (
      await send('GET', `${PAIR}/usage/reports${query}`)
    ).json()) as UsageReportPage;

  it('carries the resource and the number of the pair, which the resources share', async () => {
    install();

    await report('stigg', 1, 'append', { 'Idempotency-Key': 'one' });
    await report('paid', 1);
    await report('stigg', 1);
    later();

    const rows = (await journal()).items;
    // Four reports were seeded: the new ones follow, whatever their resource.
    expect(rows.map(({ reportSeq }) => reportSeq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.slice(4)).toMatchObject([
      {
        behavior: 'append',
        resourceKey: 'stigg',
        transactionId: 'one',
        valueAfter: '3',
        valueBefore: '2',
      },
      { resourceKey: 'paid', valueAfter: '4', valueBefore: '3' },
      { resourceKey: 'stigg', valueAfter: '4', valueBefore: '3' },
    ]);
    // Each counted against the one limit.
    expect(rows[6]).toMatchObject({ limitValue: '4', overagePercent: 0 });
  });

  it('is filtered on a resource, and an unknown one matches nothing', async () => {
    install();
    await report('paid', 1);
    later();

    expect(
      (await journal('?resourceKey=paid')).items.map(({ reportSeq }) => reportSeq),
    ).toEqual([4, 5]);
    expect((await journal('?resourceKey=nobody')).items).toEqual([]);
  });

  it('leaves no row for a report that was refused, or replayed', async () => {
    install();

    await report('schematic', 1);
    await report('stigg', 1, 'append', { 'Idempotency-Key': 'k' });
    await report('stigg', 1, 'append', { 'Idempotency-Key': 'k' });
    later();

    expect((await journal()).items).toHaveLength(5);
  });

  it('is exported with the resource as the last column', async () => {
    install();
    await report('stigg', 1);
    later();

    const csv = await (
      await send('GET', `${PAIR}/usage/reports/export?format=csv`)
    ).text();
    const [header, ...lines] = csv.trim().split('\n');
    const columns = header.split(',');

    expect(columns).toHaveLength(21);
    expect(columns.at(-1)).toBe('resource_key');
    expect(lines.map((line) => line.split(',').at(-1))).toEqual([
      'stigg',
      'schematic',
      'stigg',
      'paid',
      'stigg',
    ]);
    const filtered = await (
      await send('GET', `${PAIR}/usage/reports/export?format=csv&resourceKey=paid`)
    ).text();
    expect(filtered.trim().split('\n')).toHaveLength(2);
  });
});

describe('the state of a model that survives a reload', () => {
  // A report is dated on receipt, and a read excludes what is dated at the instant it is made.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the counters, the journal, the ceiling and what was armed', () => {
    const model = createResourcesInstancesModel({ competitors: 3 });
    model.resources.setMaxResources(4);
    model.resources.armProblem('listEntitlementResources', {
      code: 'ListEntitlementResources.Broken',
      detail: 'the list is broken',
      status: 500,
    });
    const pair = ['nagare-production', 'sources-per-competitor'] as const;
    const body = { behavior: 'append', value: { type: 'number', value: 1 } } as const;
    model.reportResourceUsage(...pair, 'fourth', body, { sent: false });

    const restored = InstanceAppModel.fromSerialized(
      JSON.parse(JSON.stringify(model.serializeForMsw())),
    );

    expect(
      restored.getEntitlementsUsageMetrics('nagare-production')[0].resources,
    ).toEqual({ atLimit: 1, count: 4 });
    expect(() =>
      restored.reportResourceUsage(...pair, 'fifth', body, { sent: false }),
    ).toThrow(/most resources/);
    // One-shot, and still armed after the trip.
    expect(() => restored.listEntitlementResources(...pair, {})).toThrow(
      'the list is broken',
    );
    expect(restored.listEntitlementResources(...pair, {}).items).toHaveLength(4);
    // The report took the number after the four of the journal.
    vi.setSystemTime(Date.now() + 1_000);
    expect(
      restored.usageHistory.listUsageReports(...pair, { resourceKey: 'fourth' }, () => 'ok')
        .items,
    ).toMatchObject([{ reportSeq: 5, resourceKey: 'fourth' }]);
  });
});
