import { client } from '@/api-client/client.gen';
import type {
  ApiWebhook,
  WebhookHistoryResponse,
  WebhookInput,
  WebhookMessage,
  WebhookMessageList,
  WebhookMessageResendResponse,
} from './types';

export async function getWebhooks() {
  const response = await client.get<{ 200: ApiWebhook[] }, unknown, true>({
    url: '/webhooks',
    throwOnError: true,
  });

  return response.data ?? [];
}

/**
 * One webhook, with its signing secret. `cache` lets the read that precedes a
 * write skip every cache (`FRESH_READ_OPTIONS`).
 */
export async function getWebhook(
  webhookId: string,
  options?: { cache?: RequestCache },
) {
  const response = await client.get<{ 200: ApiWebhook }, unknown, true>({
    ...options,
    url: '/webhooks/{webhookId}',
    path: { webhookId },
    throwOnError: true,
  });

  return response.data;
}

export async function getWebhookHistory() {
  const response = await client.get<
    { 200: WebhookHistoryResponse },
    unknown,
    true
  >({
    url: '/webhooks/history',
    throwOnError: true,
  });

  return response.data ?? { history: [] };
}

export async function createWebhook(body: WebhookInput) {
  const response = await client.post<{ 201: ApiWebhook }, unknown, true>({
    url: '/webhooks',
    body,
    throwOnError: true,
  });

  return response.data;
}

/**
 * Replaces the URL and the events of a webhook. The answer carries no signing
 * secret: the secret does not change.
 */
export async function updateWebhook(webhookId: string, body: WebhookInput) {
  const response = await client.put<{ 200: ApiWebhook }, unknown, true>({
    url: '/webhooks/{webhookId}',
    path: { webhookId },
    body,
    throwOnError: true,
  });

  return response.data;
}

export async function deleteWebhook(webhookId: string) {
  await client.delete<unknown, unknown, true>({
    url: '/webhooks/{webhookId}',
    path: { webhookId },
    throwOnError: true,
  });
}

/**
 * The most recent messages of one webhook, newest first, one entry per
 * message. Without attempts the answer is cheaper: no attempt count and no
 * last attempt per message.
 */
export async function getWebhookMessages(
  webhookId: string,
  { limit, withAttempts }: { limit: number; withAttempts: boolean },
) {
  const response = await client.get<{ 200: WebhookMessageList }, unknown, true>(
    {
      url: '/webhooks/{webhookId}/messages',
      path: { webhookId },
      query: { limit, withAttempts },
      throwOnError: true,
    },
  );

  return response.data;
}

/**
 * One message of a webhook, with its payload and the webhook's attempts at it.
 * `signal` aborts the request.
 */
export async function getWebhookMessage(
  webhookId: string,
  messageId: string,
  { signal }: { signal?: AbortSignal } = {},
) {
  const response = await client.get<{ 200: WebhookMessage }, unknown, true>({
    url: '/webhooks/{webhookId}/messages/{messageId}',
    path: { webhookId, messageId },
    signal,
    throwOnError: true,
  });

  return response.data;
}

/** Queues a manual attempt of a message the webhook already received (202). */
export async function resendWebhookMessage(
  webhookId: string,
  messageId: string,
) {
  const response = await client.post<
    { 202: WebhookMessageResendResponse },
    unknown,
    true
  >({
    url: '/webhooks/{webhookId}/messages/{messageId}/resend',
    path: { webhookId, messageId },
    throwOnError: true,
  });

  return response.data;
}
