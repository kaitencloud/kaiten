import { describe, expect, it } from 'vite-plus/test';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import {
  WEBHOOK_REFUSALS,
  WebhooksAppModel,
} from '../../e2e/app/_support/model/webhooks-app-model';
import {
  createWebhooksFormModel,
  createWebhookWithoutFilterModel,
} from '../../e2e/app/webhooks/webhooks.scenarios';
import { server } from './msw-server';

// What the mocks of saas-api's /api/webhooks routes answer, read off the wire as
// the console reads them: validation and codes as saas-api gives them, the
// secret kept across an update, an armed refusal as a problem document, and the
// scopes read from the caller's token.

const API = 'http://api.test/api';
const CUSTOMER_CREATED = 'com.kaiten.customer.v1.created';
const MODEL_CREATED = 'com.kaiten.model.v1.created';

/** A JWT-shaped token whose `scopes` claim is `scopes`. */
const tokenWith = (scopes: string[]) =>
  ['e30', btoa(JSON.stringify({ scopes })), 'sig'].join('.');

const install = (model: WebhooksAppModel) => {
  const config: E2EMswConfig = { webhooks: model.serializeForMsw() };
  server.use(
    ...createMockHandlers(config, 'off', (slot, state) => {
      Object.assign(config, { [slot]: state });
    }),
    undeclaredApiRequest,
  );
  return config;
};

const call = (
  path: string,
  { method = 'GET', body, scopes }: { method?: string; body?: unknown; scopes?: string[] } = {},
) =>
  fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(scopes ? { Authorization: `Bearer ${tokenWith(scopes)}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('webhooks mocks', () => {
  it('lists the webhooks without their secret, and one webhook with it', async () => {
    install(createWebhooksFormModel());

    const list = (await (await call('/webhooks')).json()) as Array<Record<string, unknown>>;
    expect(list.map((webhook) => webhook.id)).toEqual([
      'ep_customers',
      'ep_lifecycle',
      'ep_invoices',
    ]);
    expect(list.every((webhook) => !('signingSecret' in webhook))).toBe(true);

    const one = (await (await call('/webhooks/ep_customers')).json()) as Record<string, unknown>;
    expect(one.signingSecret).toEqual(expect.stringMatching(/^whsec_/));
    expect((await call('/webhooks/history')).status).toBe(200);
  });

  it('keeps a webhook without a filter as null', async () => {
    install(createWebhookWithoutFilterModel());

    const [webhook] = (await (await call('/webhooks')).json()) as Array<{
      eventTypes: unknown;
    }>;
    expect(webhook?.eventTypes).toBeNull();
  });

  it('creates a valid webhook first in the list, and records the write', async () => {
    const model = createWebhooksFormModel();
    const config = install(model);

    const response = await call('/webhooks', {
      method: 'POST',
      body: { url: 'https://new.example.com', eventTypes: [MODEL_CREATED] },
    });

    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };
    expect(created.id).toMatch(/^ep_/);
    const persisted = WebhooksAppModel.fromSerialized(config.webhooks!);
    expect(persisted.listWebhooks()[0]?.id).toBe(created.id);
    expect(persisted.acceptedWrites).toEqual([
      {
        operation: 'create',
        webhookId: created.id,
        body: { url: 'https://new.example.com', eventTypes: [MODEL_CREATED] },
      },
    ]);
  });

  it.each([
    [{ eventTypes: [MODEL_CREATED] }, 'CreateWebhook.MissingURL'],
    [{ url: 'https://a.example.com', eventTypes: [] }, 'CreateWebhook.MissingEventTypes'],
    [
      { url: 'https://a.example.com', eventTypes: ['CUSTOMER_CREATION'] },
      'CreateWebhook.InvalidEventTypes',
    ],
  ])('refuses %j as saas-api does (%s)', async (body, code) => {
    install(createWebhooksFormModel());

    const response = await call('/webhooks', { method: 'POST', body });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code });
  });

  it('updates the URL and the events, keeps the secret and moves updatedAt', async () => {
    const model = createWebhooksFormModel();
    install(model);
    const before = (await (await call('/webhooks/ep_customers')).json()) as {
      signingSecret: string;
      updatedAt: string;
    };

    const response = await call('/webhooks/ep_customers', {
      method: 'PUT',
      body: { url: 'https://crm.example.com/v2', eventTypes: [CUSTOMER_CREATED] },
    });

    expect(response.status).toBe(200);
    const updated = (await response.json()) as Record<string, unknown>;
    expect(updated).not.toHaveProperty('signingSecret');
    expect(updated).toMatchObject({
      url: 'https://crm.example.com/v2',
      eventTypes: [CUSTOMER_CREATED],
    });
    expect(updated.updatedAt).not.toBe(before.updatedAt);
    const after = (await (await call('/webhooks/ep_customers')).json()) as {
      signingSecret: string;
    };
    expect(after.signingSecret).toBe(before.signingSecret);
  });

  it('answers 404 Svix.NotFound for an unknown webhook on get, update and delete', async () => {
    install(createWebhooksFormModel());

    for (const [method, body] of [
      ['GET', undefined],
      ['PUT', { url: 'https://a.example.com', eventTypes: [MODEL_CREATED] }],
      ['DELETE', undefined],
    ] as const) {
      const response = await call('/webhooks/ep_unknown', { method, body });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'Svix.NotFound' });
    }
  });

  it('deletes a webhook', async () => {
    install(createWebhooksFormModel());

    expect((await call('/webhooks/ep_invoices', { method: 'DELETE' })).status).toBe(204);
    const list = (await (await call('/webhooks')).json()) as Array<{ id: string }>;
    expect(list.map((webhook) => webhook.id)).not.toContain('ep_invoices');
  });

  it('answers an armed refusal once, as a problem document with its code and words', async () => {
    const model = createWebhooksFormModel();
    model.refuseNext('createWebhook', 'svixValidation');
    install(model);
    const body = { url: 'https://new.example.com', eventTypes: [MODEL_CREATED] };

    const refused = await call('/webhooks', { method: 'POST', body });

    expect(refused.status).toBe(422);
    expect(refused.headers.get('Content-Type')).toContain('problem+json');
    expect(await refused.json()).toMatchObject({
      code: 'Svix.ValidationError',
      detail: WEBHOOK_REFUSALS.svixValidation.detail,
    });
    expect((await call('/webhooks', { method: 'POST', body })).status).toBe(201);
  });

  it('sees a change made elsewhere, and a webhook deleted elsewhere', async () => {
    const model = createWebhooksFormModel();
    model.mutateExternally('ep_customers', { url: 'https://moved.example.com' });
    model.mutateExternally('ep_invoices', null);
    install(model);

    const list = (await (await call('/webhooks')).json()) as Array<{ id: string; url: string }>;
    expect(list.find((webhook) => webhook.id === 'ep_customers')?.url).toBe(
      'https://moved.example.com',
    );
    expect((await call('/webhooks/ep_invoices')).status).toBe(404);
    expect(model.acceptedWrites).toEqual([]);
  });

  it('refuses a write to a token without write:webhooks, and lets it read', async () => {
    install(createWebhooksFormModel());

    const refused = await call('/webhooks', {
      method: 'POST',
      scopes: ['read:webhooks'],
      body: { url: 'https://new.example.com', eventTypes: [MODEL_CREATED] },
    });

    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'RequireScope.MissingScope' });
    expect((await call('/webhooks', { scopes: ['read:webhooks'] })).status).toBe(200);
    expect((await call('/webhooks', { scopes: ['read:customers'] })).status).toBe(403);
  });

  it('refuses a seed it cannot stand for', () => {
    expect(
      () =>
        new WebhooksAppModel({
          webhooks: [
            { id: 'ep_a', url: 'https://a.example.com', eventTypes: [] },
            { id: 'ep_a', url: 'https://b.example.com', eventTypes: [] },
          ],
        }),
    ).toThrow(/duplicate/);
  });
});
