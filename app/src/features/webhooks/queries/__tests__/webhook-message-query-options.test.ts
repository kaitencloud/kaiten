import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw/http';
import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { configureApiClient } from '@/lib/api/configure-api-client';
import { ApiError } from '@/lib/errors';
import type { WebhookMessageList } from '../../types';
import { webhookHistoryQueryOptions } from '../webhook-history-query-options';
import {
  shouldRetryWebhookMessage,
  WEBHOOK_MESSAGE_NOT_DELIVERED,
  webhookMessageQueryOptions,
} from '../webhook-message-query-options';
import { webhookMessagesQueryOptions } from '../webhook-messages-query-options';
import { invalidateWebhookDeliveryQueries } from '../webhook-query-invalidation';
import { webhooksQueryOptions } from '../webhooks-query-options';

const problem = (status: number, code: string) =>
  new ApiError({ status, data: { status, title: 'Refused', code } });

const emptyList: WebhookMessageList = {
  webhook: {
    id: 'ep_orders',
    url: 'https://api.example.com/hooks',
    createdAt: '2026-11-02T09:14:03Z',
    updatedAt: '2026-11-20T16:01:44Z',
  },
  messages: [],
  summary: { total: 0, delivered: 0, failed: 0, pending: 0 },
  hasMore: false,
};

// The app's own transport, so that a refusal reaches the caller as an ApiError.
beforeAll(() => configureApiClient());

describe('webhook message query options', () => {
  it('keys lists and messages apart, both under the webhooks prefix', () => {
    const list = webhookMessagesQueryOptions('ep_orders', {
      limit: 20,
      withAttempts: false,
    });
    const message = webhookMessageQueryOptions('ep_orders', 'msg_1');

    expect(list.queryKey).toEqual([
      'webhooks',
      'messages-list',
      'ep_orders',
      20,
      false,
    ]);
    expect(message.queryKey).toEqual([
      'webhooks',
      'messages',
      'ep_orders',
      'msg_1',
    ]);
    expect(list.refetchOnWindowFocus).toBe(false);
    expect(list.retry).toBe(1);
    expect(message.gcTime).toBe(60_000);
  });

  it('sends the limit and whether to join attempts', async () => {
    const searches: string[] = [];
    server.use(
      http.get('*/webhooks/:webhookId/messages', ({ request }) => {
        searches.push(new URL(request.url).search);
        return HttpResponse.json(emptyList);
      }),
    );

    const list = await new QueryClient().fetchQuery(
      webhookMessagesQueryOptions('ep_orders', {
        limit: 20,
        withAttempts: false,
      }),
    );

    expect(list).toEqual(emptyList);
    expect(searches).toEqual(['?limit=20&withAttempts=false']);
  });

  it('never reads again a message that is not found or refused', () => {
    const options = { retryNotDelivered: true };

    expect(
      shouldRetryWebhookMessage(
        0,
        problem(404, 'GetWebhookMessage.MessageNotFound'),
        options,
      ),
    ).toBe(false);
    expect(
      shouldRetryWebhookMessage(
        0,
        problem(403, 'RequireScope.MissingScope'),
        options,
      ),
    ).toBe(false);
  });

  it('reads a message of the list once more while it is not delivered yet', () => {
    const notDelivered = problem(404, WEBHOOK_MESSAGE_NOT_DELIVERED);

    expect(
      shouldRetryWebhookMessage(0, notDelivered, { retryNotDelivered: true }),
    ).toBe(true);
    expect(
      shouldRetryWebhookMessage(1, notDelivered, { retryNotDelivered: true }),
    ).toBe(false);
    expect(
      shouldRetryWebhookMessage(0, notDelivered, { retryNotDelivered: false }),
    ).toBe(false);
  });

  it('reads a message twice more after a server failure', () => {
    const failure = problem(500, 'GetWebhookMessage.LookupFailed');
    const options = { retryNotDelivered: false };

    expect(shouldRetryWebhookMessage(0, failure, options)).toBe(true);
    expect(shouldRetryWebhookMessage(1, failure, options)).toBe(true);
    expect(shouldRetryWebhookMessage(2, failure, options)).toBe(false);
  });
});

describe('invalidateWebhookDeliveryQueries', () => {
  it('marks the history, the webhook lists and the message stale, not the webhooks', async () => {
    const queryClient = new QueryClient();
    const keys: Record<string, QueryKey> = {
      webhooks: webhooksQueryOptions.queryKey,
      history: webhookHistoryQueryOptions.queryKey,
      strip: webhookMessagesQueryOptions('ep_orders', {
        limit: 20,
        withAttempts: false,
      }).queryKey,
      dialog: webhookMessagesQueryOptions('ep_orders', {
        limit: 50,
        withAttempts: true,
      }).queryKey,
      otherWebhook: webhookMessagesQueryOptions('ep_other', {
        limit: 20,
        withAttempts: false,
      }).queryKey,
      message: webhookMessageQueryOptions('ep_orders', 'msg_1').queryKey,
      otherMessage: webhookMessageQueryOptions('ep_orders', 'msg_2').queryKey,
    };
    for (const key of Object.values(keys)) {
      queryClient.setQueryData(key, {});
    }

    await invalidateWebhookDeliveryQueries(queryClient, 'ep_orders', 'msg_1');

    const stale = Object.fromEntries(
      Object.entries(keys).map(([name, key]) => [
        name,
        queryClient.getQueryState(key)?.isInvalidated,
      ]),
    );
    expect(stale).toEqual({
      webhooks: false,
      history: true,
      strip: true,
      dialog: true,
      otherWebhook: false,
      message: true,
      otherMessage: false,
    });
  });
});
