import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage, isNotFoundError } from '@/lib/errors';
import {
  invalidateWebhookQueries,
  removeWebhookQueries,
  saveWebhookOnFresh,
  webhooksQueryOptions,
} from '../queries';
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

  const updateWebhook = useMutation({
    mutationFn: saveWebhookOnFresh,
    onSuccess: async (webhook) => {
      // The answer carries no secret, nor does a list entry: replacing the entry
      // in place is safe. The detail entries, which hold the secret, are
      // invalidated by their prefix below rather than overwritten.
      upsertWebhookInCache(queryClient, webhook);
      await invalidateWebhookQueries(queryClient);
    },
    onError: async (error) => {
      toast.error(getApiErrorMessage(error));
      // A 404 comes from the fresh read of a webhook deleted meanwhile: the
      // list must forget it.
      if (isNotFoundError(error)) {
        await invalidateWebhookQueries(queryClient);
      }
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: ({ path }: { path: { webhookId: string } }) =>
      deleteWebhookRequest(path.webhookId),
    onSuccess: async (_data, variables) => {
      removeWebhookFromCache(queryClient, variables.path.webhookId);
      await invalidateWebhookQueries(queryClient);
      // Its row is gone by now: forget what it read, rather than read it again
      // into a 404.
      removeWebhookQueries(queryClient, variables.path.webhookId);
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return {
    createWebhook,
    deleteWebhook,
    updateWebhook,
  };
}
