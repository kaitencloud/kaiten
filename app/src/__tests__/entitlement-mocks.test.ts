import { describe, expect, it } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import { EntitlementAppModel } from '../../e2e/app/_support/model/entitlement-app-model';
import { server } from './msw-server';

// What the mocks standing in for the entitlements answer when one is written: a PUT
// replaces the entitlement, as the API does, so what the body leaves out is not kept.
// These read the answers off the wire, as the console does.

const API = 'http://api.test/api';

const entitlement = (
  slug: string,
  type: Entitlement['type'],
  extra: Partial<Entitlement> = {},
): Entitlement => ({
  aggregationMethod: 'SUM',
  createdAt: '2026-03-01T09:00:00.000Z',
  description: null,
  id: `entitlement-${slug}`,
  name: slug,
  slug,
  type,
  updatedAt: '2026-03-01T09:00:00.000Z',
  ...extra,
});

const install = (...entitlements: Entitlement[]) => {
  const config: E2EMswConfig = {
    entitlements: new EntitlementAppModel({ entitlements }).serializeForMsw(),
  };
  server.use(
    ...createMockHandlers(config, 'off', undefined, true),
    undeclaredApiRequest,
  );
};

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });

const read = async (slug: string) =>
  (await (await send('GET', `/entitlements/${slug}`)).json()) as Entitlement;

describe('the warning threshold of an entitlement, as the mocks keep it', () => {
  it('turns the warning off when a PUT leaves the threshold out, as the API does', async () => {
    install(
      entitlement('qa-requests', 'NUMBER', { warningThresholdPercent: 80 }),
    );

    const response = await send('PUT', '/entitlements/qa-requests', {
      aggregationMethod: 'SUM',
      description: 'Edited in the console',
      name: 'QA Requests',
      type: 'NUMBER',
    });

    expect(response.status).toBe(200);
    expect(await read('qa-requests')).toMatchObject({
      description: 'Edited in the console',
      warningThresholdPercent: 0,
    });
  });

  it('keeps the threshold a PUT sends', async () => {
    install(
      entitlement('qa-requests', 'NUMBER', { warningThresholdPercent: 80 }),
    );

    await send('PUT', '/entitlements/qa-requests', {
      aggregationMethod: 'SUM',
      name: 'QA Requests',
      type: 'NUMBER',
      warningThresholdPercent: 60,
    });

    expect((await read('qa-requests')).warningThresholdPercent).toBe(60);
  });

  it('gives an AI credit the same replacement, and a boolean the 0 the API returns for every type', async () => {
    install(
      entitlement('qa-ai-credits', 'NUMBER_AI_CREDIT', {
        warningThresholdPercent: 80,
      }),
      entitlement('qa-flag', 'BOOLEAN'),
    );

    await send('PUT', '/entitlements/qa-ai-credits', {
      aggregationMethod: 'SUM',
      name: 'QA AI credits',
      type: 'NUMBER_AI_CREDIT',
    });
    await send('PUT', '/entitlements/qa-flag', {
      name: 'QA flag',
      type: 'BOOLEAN',
    });

    expect((await read('qa-ai-credits')).warningThresholdPercent).toBe(0);
    expect((await read('qa-flag')).warningThresholdPercent).toBe(0);
  });

  it('refuses a threshold on a boolean or a config entitlement, 0 included, as the API does', async () => {
    install(entitlement('qa-flag', 'BOOLEAN'), entitlement('qa-config', 'CONFIG'));

    for (const [slug, type] of [
      ['qa-flag', 'BOOLEAN'],
      ['qa-config', 'CONFIG'],
    ] as const) {
      const response = await send('PUT', `/entitlements/${slug}`, {
        name: slug,
        type,
        warningThresholdPercent: 0,
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: 'UpdateEntitlement.InvalidEnforcementPolicyConfiguration',
      });
    }

    const created = await send('POST', '/entitlements', {
      name: 'Flag',
      type: 'BOOLEAN',
      warningThresholdPercent: 0,
    });
    expect(created.status).toBe(422);
    expect(await created.json()).toMatchObject({
      code: 'CreateEntitlement.InvalidEnforcementPolicyConfiguration',
    });
  });

  it('stores the threshold of an entitlement made with one', async () => {
    install();

    const created = (await (
      await send('POST', '/entitlements', {
        aggregationMethod: 'SUM',
        name: 'Requests',
        type: 'NUMBER',
        warningThresholdPercent: 75,
      })
    ).json()) as Entitlement;

    expect(created.warningThresholdPercent).toBe(75);
  });
});

// A combined entitlement (usageSource COMBINED_USAGE) is the weighted sum of the usage of its
// sources. The mocks refuse what the API refuses, in its order and with its codes, so that a screen
// that sends a source wrong is caught, and one that sends it right is never refused.
describe('a combined entitlement, as the mocks keep it', () => {
  const source = (slug: string, extra: Partial<Entitlement> = {}) =>
    entitlement(slug, 'NUMBER', { aggregationMethod: 'SUM', ...extra });
  const monthly = {
    resetAnchor: 'CALENDAR',
    resetPeriod: 'MONTH',
  } as const;
  const combined = (slug: string, extra: Partial<Entitlement> = {}) =>
    entitlement(slug, 'NUMBER', {
      sources: [
        { entitlementSlug: 'ai-credits', weight: '0.6' },
        { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
      ],
      usageSource: 'COMBINED_USAGE',
      ...extra,
    });
  const create = (body: Record<string, unknown>) =>
    send('POST', '/entitlements', {
      aggregationMethod: 'SUM',
      name: 'Credits',
      type: 'NUMBER',
      usageSource: 'COMBINED_USAGE',
      ...body,
    });
  const refusal = async (response: Response) => ({
    code: ((await response.json()) as { code: string }).code,
    status: response.status,
  });

  it('is calculated unless it says combined, for a number, and has no usage source for the others', async () => {
    install();

    const number = (await (
      await send('POST', '/entitlements', { name: 'Seats', type: 'NUMBER' })
    ).json()) as Entitlement;
    const flag = (await (
      await send('POST', '/entitlements', { name: 'SSO', type: 'BOOLEAN' })
    ).json()) as Entitlement;

    expect(number.usageSource).toBe('CALCULATED_USAGE');
    expect(flag.usageSource).toBeUndefined();
  });

  it('is created from two sources: always a sum, with the weights as the API writes them, its sources alphabetical and the window they share', async () => {
    install(source('firecrawl-credits', monthly), source('ai-credits', monthly));

    const response = await create({
      sources: [
        { entitlementSlug: 'firecrawl-credits', weight: '0.40' },
        { entitlementSlug: 'ai-credits' },
      ],
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      aggregationMethod: 'SUM',
      resetAnchor: 'CALENDAR',
      resetPeriod: 'MONTH',
      sources: [
        { entitlementSlug: 'ai-credits', weight: '1' },
        { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
      ],
      usageSource: 'COMBINED_USAGE',
    });
  });

  it.each([
    [
      'fewer than two sources',
      { sources: [{ entitlementSlug: 'ai-credits' }] },
      422,
      'CreateEntitlement.CombinedSourcesRequired',
    ],
    [
      'a source named twice',
      {
        sources: [
          { entitlementSlug: 'ai-credits' },
          { entitlementSlug: 'ai-credits' },
        ],
      },
      422,
      'CreateEntitlement.CombinedSourceDuplicate',
    ],
    [
      'a weight of 0',
      {
        sources: [
          { entitlementSlug: 'ai-credits', weight: '0' },
          { entitlementSlug: 'firecrawl-credits' },
        ],
      },
      422,
      'CreateEntitlement.CombinedSourceWeightInvalid',
    ],
    [
      'a source that does not exist',
      {
        sources: [
          { entitlementSlug: 'ai-credits' },
          { entitlementSlug: 'ghost' },
        ],
      },
      404,
      'CreateEntitlement.SourceNotFound',
    ],
    [
      'a source that is combined itself',
      {
        sources: [
          { entitlementSlug: 'ai-credits' },
          { entitlementSlug: 'total' },
        ],
      },
      422,
      'CreateEntitlement.SourceIsCombined',
    ],
    [
      'a source that is a flag',
      {
        sources: [
          { entitlementSlug: 'ai-credits' },
          { entitlementSlug: 'sso' },
        ],
      },
      422,
      'CreateEntitlement.SourceUnsupportedType',
    ],
    [
      'a source that is averaged',
      {
        sources: [
          { entitlementSlug: 'ai-credits' },
          { entitlementSlug: 'latency' },
        ],
      },
      422,
      'CreateEntitlement.SourceUnsupportedAggregation',
    ],
    [
      'sources on another window than the others',
      {
        sources: [
          { entitlementSlug: 'ai-credits' },
          { entitlementSlug: 'monthly-requests' },
        ],
      },
      422,
      'CreateEntitlement.SourceWindowMismatch',
    ],
    [
      'a window that is not the one of the sources',
      {
        resetAnchor: 'CALENDAR',
        resetPeriod: 'MONTH',
        sources: [
          { entitlementSlug: 'ai-credits' },
          { entitlementSlug: 'firecrawl-credits' },
        ],
      },
      422,
      'CreateEntitlement.CombinedWindowMismatch',
    ],
    [
      'an aggregation that is not a sum',
      {
        aggregationMethod: 'AVERAGE',
        sources: [
          { entitlementSlug: 'ai-credits' },
          { entitlementSlug: 'firecrawl-credits' },
        ],
      },
      422,
      'CreateEntitlement.CombinedAggregationMustBeSum',
    ],
    [
      'a threshold above 0',
      {
        sources: [
          { entitlementSlug: 'ai-credits' },
          { entitlementSlug: 'firecrawl-credits' },
        ],
        warningThresholdPercent: 50,
      },
      422,
      'CreateEntitlement.CombinedWarningThreshold',
    ],
  ])('refuses %s on creation', async (_name, body, status, code) => {
    install(
      source('ai-credits'),
      source('firecrawl-credits'),
      source('monthly-requests', monthly),
      source('latency', { aggregationMethod: 'AVERAGE' }),
      entitlement('sso', 'BOOLEAN'),
      combined('total'),
    );

    expect(await refusal(await create(body))).toEqual({ code, status });
  });

  it('refuses sources on an entitlement that is not combined, and a usage source on a flag', async () => {
    install(source('ai-credits'), source('firecrawl-credits'));

    expect(
      await refusal(
        await send('POST', '/entitlements', {
          name: 'Seats',
          sources: [{ entitlementSlug: 'ai-credits' }],
          type: 'NUMBER',
        }),
      ),
    ).toEqual({ code: 'CreateEntitlement.SourcesNotAllowed', status: 422 });
    // An empty list is nothing to refuse.
    expect(
      (
        await send('POST', '/entitlements', {
          name: 'Seats',
          sources: [],
          type: 'NUMBER',
        })
      ).status,
    ).toBe(201);
    expect(
      await refusal(
        await send('POST', '/entitlements', {
          name: 'SSO',
          type: 'BOOLEAN',
          usageSource: 'CALCULATED_USAGE',
        }),
      ),
    ).toEqual({
      code: 'CreateEntitlement.InvalidUsageSourceConfiguration',
      status: 400,
    });
  });

  it('is updated with its sources as a whole, and takes the window of the new ones, which is not a one-way door', async () => {
    install(
      source('firecrawl-credits'),
      source('ai-credits'),
      source('monthly-requests', monthly),
      source('monthly-exports', monthly),
      combined('credits'),
    );
    const put = (body: Record<string, unknown>) =>
      send('PUT', '/entitlements/credits', {
        aggregationMethod: 'SUM',
        name: 'Credits',
        type: 'NUMBER',
        usageSource: 'COMBINED_USAGE',
        ...body,
      });

    expect(
      (
        await put({
          sources: [
            { entitlementSlug: 'monthly-requests' },
            { entitlementSlug: 'monthly-exports', weight: '2' },
          ],
        })
      ).status,
    ).toBe(200);
    expect(await read('credits')).toMatchObject({
      resetAnchor: 'CALENDAR',
      resetPeriod: 'MONTH',
      sources: [
        { entitlementSlug: 'monthly-exports', weight: '2' },
        { entitlementSlug: 'monthly-requests', weight: '1' },
      ],
    });

    // And back to a lifetime counter: the stored window goes with the sources.
    await put({
      sources: [
        { entitlementSlug: 'ai-credits' },
        { entitlementSlug: 'firecrawl-credits' },
      ],
    });
    const back = await read('credits');
    expect(back.resetPeriod).toBeUndefined();
    expect(back.resetAnchor).toBeUndefined();
  });

  it('refuses an update that names no source, that changes where the usage comes from, or that names a window that is not the sources', async () => {
    install(source('firecrawl-credits'), source('ai-credits'), combined('credits'));
    const put = (body: Record<string, unknown>) =>
      send('PUT', '/entitlements/credits', {
        aggregationMethod: 'SUM',
        name: 'Credits',
        type: 'NUMBER',
        ...body,
      });

    expect(await refusal(await put({ usageSource: 'COMBINED_USAGE' }))).toEqual({
      code: 'UpdateEntitlement.CombinedSourcesRequired',
      status: 422,
    });
    expect(
      await refusal(await put({ usageSource: 'CALCULATED_USAGE' })),
    ).toEqual({ code: 'UpdateEntitlement.ImmutableUsageSource', status: 400 });
    expect(
      await refusal(
        await put({
          resetAnchor: 'CALENDAR',
          resetPeriod: 'MONTH',
          sources: [
            { entitlementSlug: 'ai-credits' },
            { entitlementSlug: 'firecrawl-credits' },
          ],
        }),
      ),
    ).toEqual({ code: 'UpdateEntitlement.CombinedWindowMismatch', status: 422 });
  });

  it('refuses to give an entitlement that a combined one sums a reset period, and a usage source to a flag', async () => {
    install(source('firecrawl-credits'), source('ai-credits'), combined('credits'), entitlement('sso', 'BOOLEAN'));

    expect(
      await refusal(
        await send('PUT', '/entitlements/firecrawl-credits', {
          aggregationMethod: 'SUM',
          name: 'Firecrawl',
          resetAnchor: 'CALENDAR',
          resetPeriod: 'MONTH',
          type: 'NUMBER',
        }),
      ),
    ).toEqual({ code: 'UpdateEntitlement.SourceWindowLocked', status: 422 });
    expect(
      await refusal(
        await send('PUT', '/entitlements/sso', {
          name: 'SSO',
          type: 'BOOLEAN',
          usageSource: 'CALCULATED_USAGE',
        }),
      ),
    ).toEqual({ code: 'UpdateEntitlement.ImmutableUsageSource', status: 400 });
  });

  it('refuses to delete an entitlement that a combined one sums, naming it and counting it, and deletes the combined one', async () => {
    install(source('firecrawl-credits'), source('ai-credits'), combined('credits'));

    const refused = await send('DELETE', '/entitlements/firecrawl-credits');
    const problem = (await refused.json()) as {
      code: string;
      detail: string;
      errors: Array<{ value: unknown }>;
    };

    expect(refused.status).toBe(409);
    expect(problem.code).toBe('DeleteEntitlement.InUseConflict');
    expect(problem.detail).toContain('credits');
    expect(problem.errors[0].value).toEqual({ combinedEntitlements: 1 });

    expect((await send('DELETE', '/entitlements/credits')).status).toBe(204);
    expect((await send('DELETE', '/entitlements/firecrawl-credits')).status).toBe(204);
  });
});
