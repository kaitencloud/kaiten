import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import {
  webhookDetailQueryOptions,
  webhookHistoryQueryOptions,
  webhookMessageQueryOptions,
  webhookMessagesQueryOptions,
  webhooksQueryOptions,
} from '../queries';
import type { ApiWebhook } from '../types';
import { useWebhookMutations } from './use-webhook-mutations';

const {
  createWebhookMock,
  deleteWebhookMock,
  saveWebhookOnFreshMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  createWebhookMock: vi.fn(),
  deleteWebhookMock: vi.fn(),
  saveWebhookOnFreshMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('../webhooks.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../webhooks.api')>()),
  createWebhook: createWebhookMock,
  deleteWebhook: deleteWebhookMock,
}));

vi.mock('../queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../queries')>()),
  saveWebhookOnFresh: saveWebhookOnFreshMock,
}));

/** What a create, an update or a delete invalidates: no message list nor message. */
function expectWebhookQueriesInvalidated(spy: {
  mock: { calls: unknown[][] };
}) {
  expect(spy.mock.calls.map(([filters]) => filters)).toEqual(
    expect.arrayContaining([
      { queryKey: webhooksQueryOptions.queryKey, exact: true },
      { queryKey: webhookHistoryQueryOptions.queryKey, exact: true },
      { queryKey: ['webhooks', 'detail'] },
    ]),
  );
}

const existingWebhook: ApiWebhook = {
  createdAt: '2026-03-01T12:00:00Z',
  eventTypes: ['com.kaiten.customer.v1.created'],
  id: 'webhook-existing',
  updatedAt: '2026-03-01T12:00:00Z',
  url: 'https://example.com/existing',
};

const createdWebhook: ApiWebhook = {
  createdAt: '2026-03-02T12:00:00Z',
  eventTypes: ['com.kaiten.instance.v1.updated'],
  id: 'webhook-created',
  updatedAt: '2026-03-02T12:00:00Z',
  url: 'https://example.com/created',
};

describe('useWebhookMutations', () => {
  let queryClient: QueryClient;

  function createWrapper() {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    };
  }

  beforeEach(() => {
    toastErrorMock.mockReset();
    createWebhookMock.mockReset();
    deleteWebhookMock.mockReset();
    saveWebhookOnFreshMock.mockReset();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });

    queryClient.setQueryData(webhooksQueryOptions.queryKey, [existingWebhook]);

    createWebhookMock.mockResolvedValue(createdWebhook);
    deleteWebhookMock.mockResolvedValue(undefined);
  });

  it('updates the webhooks cache immediately after creating a webhook', async () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useWebhookMutations(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.createWebhook.mutateAsync({
        body: {
          eventTypes: ['com.kaiten.instance.v1.updated'],
          url: 'https://example.com/created',
        },
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(webhooksQueryOptions.queryKey)).toEqual([
        createdWebhook,
        existingWebhook,
      ]);
    });

    expectWebhookQueriesInvalidated(invalidateQueriesSpy);
  });

  it("leaves the webhooks' deliveries alone", async () => {
    const messagesKey = webhookMessagesQueryOptions(existingWebhook.id, {
      limit: 20,
      withAttempts: false,
    }).queryKey;
    const messageKey = webhookMessageQueryOptions(
      existingWebhook.id,
      'msg_1',
    ).queryKey;
    const detailKey = webhookDetailQueryOptions(existingWebhook.id).queryKey;
    queryClient.setQueryData(messagesKey, { messages: [] });
    queryClient.setQueryData(messageKey, { messageId: 'msg_1' });
    queryClient.setQueryData(detailKey, existingWebhook);
    const { result } = renderHook(() => useWebhookMutations(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.createWebhook.mutateAsync({
        body: {
          eventTypes: ['com.kaiten.instance.v1.updated'],
          url: 'https://example.com/created',
        },
      });
    });

    expect(queryClient.getQueryState(messagesKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(messageKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it('removes the webhook from cache immediately after deleting it', async () => {
    queryClient.setQueryData(webhooksQueryOptions.queryKey, [
      existingWebhook,
      createdWebhook,
    ]);

    const { result } = renderHook(() => useWebhookMutations(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.deleteWebhook.mutateAsync({
        path: { webhookId: createdWebhook.id },
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(webhooksQueryOptions.queryKey)).toEqual([
        existingWebhook,
      ]);
    });
  });

  it("forgets the deleted webhook's detail and deliveries, not the others'", async () => {
    const keysOf = (webhookId: string) => [
      webhookDetailQueryOptions(webhookId).queryKey,
      webhookMessagesQueryOptions(webhookId, { limit: 20, withAttempts: false })
        .queryKey,
      webhookMessageQueryOptions(webhookId, 'msg_1').queryKey,
    ];
    for (const key of [
      ...keysOf(createdWebhook.id),
      ...keysOf(existingWebhook.id),
    ]) {
      queryClient.setQueryData(key, {});
    }
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useWebhookMutations(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.deleteWebhook.mutateAsync({
        path: { webhookId: createdWebhook.id },
      });
    });

    expectWebhookQueriesInvalidated(invalidateQueriesSpy);
    for (const key of keysOf(createdWebhook.id)) {
      expect(queryClient.getQueryState(key)).toBeUndefined();
    }
    for (const key of keysOf(existingWebhook.id)) {
      expect(queryClient.getQueryState(key)).toBeDefined();
    }
  });

  describe('updateWebhook', () => {
    const updatedWebhook: ApiWebhook = {
      ...existingWebhook,
      eventTypes: ['com.kaiten.model.v1.created'],
      updatedAt: '2026-03-03T12:00:00Z',
    };
    const variables = {
      webhookId: existingWebhook.id,
      edited: {
        eventTypes: ['com.kaiten.model.v1.created'],
        url: existingWebhook.url,
      },
      opened: {
        eventTypes: existingWebhook.eventTypes,
        url: existingWebhook.url,
      },
    };

    it('saves on a fresh read, replaces the webhook in place and refreshes the lists', async () => {
      queryClient.setQueryData(webhooksQueryOptions.queryKey, [
        createdWebhook,
        existingWebhook,
      ]);
      saveWebhookOnFreshMock.mockResolvedValue(updatedWebhook);
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useWebhookMutations(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.updateWebhook.mutateAsync(variables);
      });

      expect(saveWebhookOnFreshMock.mock.calls[0]?.[0]).toEqual(variables);
      expect(queryClient.getQueryData(webhooksQueryOptions.queryKey)).toEqual([
        createdWebhook,
        updatedWebhook,
      ]);
      expectWebhookQueriesInvalidated(invalidateQueriesSpy);
      expect(toastErrorMock).not.toHaveBeenCalled();
    });

    it("shows the API's words when the save is refused, and leaves the lists alone", async () => {
      saveWebhookOnFreshMock.mockRejectedValue(
        new ApiError({
          status: 422,
          data: { status: 422, detail: 'The URL is not valid.' },
        }),
      );
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useWebhookMutations(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.updateWebhook
          .mutateAsync(variables)
          .catch(() => undefined);
      });

      expect(toastErrorMock).toHaveBeenCalledTimes(1);
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    });

    it('refreshes the lists when the webhook was deleted meanwhile', async () => {
      saveWebhookOnFreshMock.mockRejectedValue(
        new ApiError({ status: 404, data: { status: 404, code: 'Svix.NotFound' } }),
      );
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useWebhookMutations(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.updateWebhook
          .mutateAsync(variables)
          .catch(() => undefined);
      });

      expect(toastErrorMock).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expectWebhookQueriesInvalidated(invalidateQueriesSpy);
      });
    });
  });
});
