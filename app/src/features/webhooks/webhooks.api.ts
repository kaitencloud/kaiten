import { client } from '@/api-client/client.gen';
import type {
  ApiWebhook,
  CreateWebhookInput,
  WebhookHistoryResponse,
} from './types';

export async function getWebhooks() {
  const response = await client.get<{ 200: ApiWebhook[] }, unknown, true>({
    url: '/webhooks',
    throwOnError: true,
  });

  return response.data ?? [];
}

export async function getWebhook(webhookId: string) {
  const response = await client.get<{ 200: ApiWebhook }, unknown, true>({
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

export async function createWebhook(body: CreateWebhookInput) {
  const response = await client.post<{ 201: ApiWebhook }, unknown, true>({
    url: '/webhooks',
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
