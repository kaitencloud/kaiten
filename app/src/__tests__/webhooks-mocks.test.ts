import { describe, expect, it } from 'vite-plus/test';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import {
  WEBHOOK_REFUSALS,
  WebhooksAppModel,
} from '../../e2e/app/_support/model/webhooks-app-model';
import {
  createWebhooksDeliveriesModel,
  createWebhooksFormModel,
  createWebhooksLegacyHistoryModel,
  createWebhookWithoutFilterModel,
  OPS_MESSAGES,
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
  describe('deliveries', () => {
    type Listed = {
      messages: Array<{ messageId: string; status: string; lastAttempt?: unknown; attemptCount?: number }>;
      summary: Record<string, number>;
      hasMore: boolean;
      webhook: { id: string; createdAt: string };
    };
    type Detail = {
      payloadAvailable: boolean;
      payload: unknown;
      attempts: Array<{ id: string; status: string; triggerType: string; timestamp: string }>;
    };

    it('lists a webhook\'s messages newest first, with or without attempts', async () => {
      install(createWebhooksDeliveriesModel());

      const response = await call('/webhooks/ep_ops/messages?limit=20&withAttempts=false');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const strip = (await response.json()) as Listed;
      expect(strip.messages).toHaveLength(20);
      expect(strip.messages[0]?.messageId).toBe(OPS_MESSAGES.newest);
      expect(strip.messages.some((message) => 'lastAttempt' in message)).toBe(false);
      expect(strip.summary).toEqual({ total: 20, delivered: 16, failed: 2, pending: 2 });
      expect(strip.hasMore).toBe(true);

      const dialog = (await (await call('/webhooks/ep_ops/messages')).json()) as Listed;
      expect(dialog.messages).toHaveLength(25);
      expect(dialog.hasMore).toBe(false);
      expect(dialog.summary).toEqual({ total: 25, delivered: 19, failed: 4, pending: 2 });
      const failed = dialog.messages.find((message) => message.messageId === OPS_MESSAGES.failed);
      expect(failed).toMatchObject({ status: 'fail', attemptCount: 3 });
      expect(failed?.lastAttempt).not.toHaveProperty('response');

      expect((await call('/webhooks/ep_ops/messages?limit=101')).status).toBe(400);
      expect(await (await call('/webhooks/ep_unknown/messages')).json()).toMatchObject({
        code: 'GetWebhookMessages.WebhookNotFound',
      });
    });

    it('reads a message with its attempts newest first, and refuses one of another webhook', async () => {
      install(createWebhooksDeliveriesModel());

      const message = (await (
        await call(`/webhooks/ep_ops/messages/${OPS_MESSAGES.resent}`)
      ).json()) as Detail;
      expect(message.payloadAvailable).toBe(true);
      expect(message.attempts.map((attempt) => attempt.triggerType)).toEqual([
        'manual',
        'scheduled',
        'scheduled',
      ]);

      const expired = (await (
        await call('/webhooks/ep_audit/messages/msg_audit_0')
      ).json()) as Detail;
      expect(expired).toMatchObject({ payloadAvailable: false, payload: null });

      const elsewhere = await call(`/webhooks/ep_crm/messages/${OPS_MESSAGES.newest}`);
      expect(elsewhere.status).toBe(404);
      expect(await elsewhere.json()).toMatchObject({ code: 'GetWebhookMessage.NotDelivered' });
      expect((await call('/webhooks/ep_ops/messages/evt_1')).status).toBe(400);
    });

    it('resends a message as a manual attempt that settles on the second read', async () => {
      const config = install(createWebhooksDeliveriesModel());
      const path = `/webhooks/ep_ops/messages/${OPS_MESSAGES.failedOnce}`;

      const queued = await call(`${path}/resend`, { method: 'POST' });
      expect(queued.status).toBe(202);
      expect(await queued.json()).toEqual({
        messageId: OPS_MESSAGES.failedOnce,
        webhookId: 'ep_ops',
      });

      const first = (await (await call(path)).json()) as Detail;
      expect(first.attempts[0]).toMatchObject({ status: 'sending', triggerType: 'manual' });
      const second = (await (await call(path)).json()) as Detail;
      expect(second.attempts[0]).toMatchObject({ status: 'success', triggerType: 'manual' });
      expect(second.attempts).toHaveLength(2);

      const persisted = WebhooksAppModel.fromSerialized(config.webhooks!);
      expect(persisted.acceptedWrites).toEqual([
        { operation: 'resend', webhookId: 'ep_ops', messageId: OPS_MESSAGES.failedOnce },
      ]);
      const history = persisted.history().history;
      expect(history[0]).toMatchObject({
        messageId: OPS_MESSAGES.failedOnce,
        status: 'success',
        triggerType: 'manual',
      });
    });

    it('refuses a resend of an expired body, and one without write:webhooks', async () => {
      install(createWebhooksDeliveriesModel());

      const expired = await call('/webhooks/ep_audit/messages/msg_audit_0/resend', {
        method: 'POST',
      });
      expect(expired.status).toBe(409);
      expect(await expired.json()).toMatchObject({
        code: 'ResendWebhookMessage.PayloadUnavailable',
      });

      const readOnly = await call(`/webhooks/ep_ops/messages/${OPS_MESSAGES.newest}/resend`, {
        method: 'POST',
        scopes: ['read:webhooks'],
      });
      expect(readOnly.status).toBe(403);
      expect(await readOnly.json()).toMatchObject({ code: 'RequireScope.MissingScope' });
    });

    it('derives the history from the attempts, 50 per webhook at most', async () => {
      const model = new WebhooksAppModel({
        webhooks: [{ id: 'ep_busy', url: 'https://busy.example.com', eventTypes: [CUSTOMER_CREATED] }],
        messages: Array.from({ length: 30 }, (_, index) => ({
          hookId: 'ep_busy',
          messageId: `msg_busy_${index}`,
          eventType: CUSTOMER_CREATED,
          timestamp: new Date(Date.UTC(2026, 10, 26, 10, index)).toISOString(),
          payload: {},
          attempts: [0, 1].map((attempt) => ({
            id: `atmpt_busy_${index}_${attempt}`,
            timestamp: new Date(Date.UTC(2026, 10, 26, 10, index, attempt)).toISOString(),
            status: attempt === 0 ? ('fail' as const) : ('success' as const),
            triggerType: 'scheduled' as const,
          })),
        })),
      });
      install(model);

      const { history } = (await (await call('/webhooks/history')).json()) as {
        history: Array<{ attemptId: string }>;
      };
      expect(history).toHaveLength(50);
      expect(history[0]?.attemptId).toBe('atmpt_busy_29_1');
    });

    it('answers the history of an older saas-api without message ids', async () => {
      install(createWebhooksLegacyHistoryModel());

      const { history } = (await (await call('/webhooks/history')).json()) as {
        history: Array<Record<string, unknown>>;
      };
      expect(history.length).toBeGreaterThan(0);
      expect(history.some((entry) => 'messageId' in entry || 'attemptId' in entry)).toBe(false);
    });

    it('refuses a seed with a duplicate attempt id or a message id that is not one', () => {
      const webhooks = [{ id: 'ep_a', url: 'https://a.example.com', eventTypes: [] }];
      const attempt = {
        id: 'atmpt_1',
        timestamp: '2026-11-26T10:00:00Z',
        status: 'success' as const,
        triggerType: 'scheduled' as const,
      };
      const message = {
        hookId: 'ep_a',
        messageId: 'msg_1',
        eventType: CUSTOMER_CREATED,
        timestamp: '2026-11-26T10:00:00Z',
        payload: {},
        attempts: [attempt],
      };

      expect(
        () =>
          new WebhooksAppModel({
            webhooks,
            messages: [message, { ...message, messageId: 'msg_2' }],
          }),
      ).toThrow(/duplicate attempt id/);
      expect(
        () => new WebhooksAppModel({ webhooks, messages: [{ ...message, messageId: 'evt_1' }] }),
      ).toThrow();
    });
  });
});
