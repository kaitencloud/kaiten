import { http, HttpResponse } from 'msw/http';
import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { configureApiClient } from '@/lib/api/configure-api-client';
import { isNotFoundError } from '@/lib/errors';
import type { ApiWebhook, WebhookInput } from '../../types';
import { WEBHOOK_EVENTS } from '../../utils/webhook-event-catalogue';
import { webhookToBody } from '../../utils/webhook-form-values';
import { saveWebhookOnFresh } from '../webhook-save';

const CUSTOMER_CREATED = WEBHOOK_EVENTS.CUSTOMER_CREATED.type;
const MODEL_CREATED = WEBHOOK_EVENTS.MODEL_CREATED.type;
const INSTANCE_CREATED = WEBHOOK_EVENTS.INSTANCE_CREATED.type;

const opened: ApiWebhook = {
  id: 'ep_1',
  url: 'https://api.example.com/hooks',
  eventTypes: [CUSTOMER_CREATED],
  signingSecret: 'whsec_test',
};

/** Serves the webhook as `stored` says, and records each PUT body. */
function serveWebhook(stored: ApiWebhook | null) {
  const puts: unknown[] = [];
  let reads = 0;

  server.use(
    http.get('*/webhooks/:webhookId', () => {
      reads += 1;
      return stored
        ? HttpResponse.json(stored)
        : HttpResponse.json(
            { status: 404, title: 'Not Found', code: 'Svix.NotFound' },
            { status: 404 },
          );
    }),
    http.put('*/webhooks/:webhookId', async ({ params, request }) => {
      const body = (await request.json()) as WebhookInput;
      puts.push(body);
      return HttpResponse.json({ id: params.webhookId, ...body });
    }),
  );

  return { puts, reads: () => reads };
}

// The app's own transport, so that a refusal reaches the caller as an ApiError.
beforeAll(() => configureApiClient());

describe('saveWebhookOnFresh', () => {
  it('keeps a URL changed elsewhere and applies the events changed here', async () => {
    const api = serveWebhook({ ...opened, url: 'https://other.example.com/hooks' });
    const edited = { ...webhookToBody(opened), eventTypes: [MODEL_CREATED, INSTANCE_CREATED] };

    await saveWebhookOnFresh({ webhookId: 'ep_1', edited, opened: webhookToBody(opened) });

    expect(api.reads()).toBe(1);
    expect(api.puts).toEqual([
      {
        eventTypes: [MODEL_CREATED, INSTANCE_CREATED],
        url: 'https://other.example.com/hooks',
      },
    ]);
  });

  it('writes nothing for a webhook deleted meanwhile, and says so', async () => {
    const api = serveWebhook(null);
    const edited = { ...webhookToBody(opened), url: 'https://new.example.com' };

    const outcome = await saveWebhookOnFresh({
      webhookId: 'ep_1',
      edited,
      opened: webhookToBody(opened),
    }).catch((error: unknown) => error);

    expect(isNotFoundError(outcome)).toBe(true);
    expect(api.puts).toEqual([]);
  });
});
