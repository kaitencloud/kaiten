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
