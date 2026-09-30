import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import { invalidateWebhookQueries, webhooksQueryOptions } from '../queries';
import type { ApiWebhook } from '../types';
import {
  createWebhook as createWebhookRequest,
  deleteWebhook as deleteWebhookRequest,
} from '../webhooks.api';

function upsertWebhookInCache(queryClient: QueryClient, webhook: ApiWebhook) {
  queryClient.setQueryData(
    webhooksQueryOptions.queryKey,
    (current: ApiWebhook[] | undefined) => {
      const nextWebhooks = current ?? [];
      const existingIndex = nextWebhooks.findIndex(
        (currentWebhook) => currentWebhook.id === webhook.id,
      );

      if (existingIndex === -1) {
        return [webhook, ...nextWebhooks];
      }

      return nextWebhooks.map((currentWebhook) =>
        currentWebhook.id === webhook.id ? webhook : currentWebhook,
      );
    },
  );
}

function removeWebhookFromCache(queryClient: QueryClient, webhookId: string) {
  queryClient.setQueryData(
    webhooksQueryOptions.queryKey,
    (current: ApiWebhook[] | undefined) =>
      current?.filter((webhook) => webhook.id !== webhookId) ?? current,
  );
}

export function useWebhookMutations() {
  const queryClient = useQueryClient();

  const createWebhook = useMutation({
    mutationFn: ({
      body,
    }: {
      body: Parameters<typeof createWebhookRequest>[0];
    }) => createWebhookRequest(body),
    onSuccess: async (webhook) => {
      upsertWebhookInCache(queryClient, webhook);
      await invalidateWebhookQueries(queryClient);
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: ({ path }: { path: { webhookId: string } }) =>
      deleteWebhookRequest(path.webhookId),
    onSuccess: async (_data, variables) => {
      removeWebhookFromCache(queryClient, variables.path.webhookId);
      await invalidateWebhookQueries(queryClient);
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return {
    createWebhook,
    deleteWebhook,
  };
}
