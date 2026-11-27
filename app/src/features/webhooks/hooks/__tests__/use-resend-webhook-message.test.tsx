import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import i18n from 'i18next';
import { http, HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { configureApiClient } from '@/lib/api/configure-api-client';
import en from '@/lib/i18n/locales/en';
import { useResendWebhookMessage } from '../use-resend-webhook-message';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

const DETAIL = en.Pages.Integrations.Webhooks.Deliveries.Detail;

/** Answers the resend with `status`; records each resend that reached the API. */
function serveResend(status: number, code = 'ResendWebhookMessage.Refused') {
  const resends: string[] = [];
  server.use(
    http.post(
      '*/webhooks/:webhookId/messages/:messageId/resend',
      ({ params }) => {
        resends.push(`${String(params.webhookId)}/${String(params.messageId)}`);
        return status === 202
          ? HttpResponse.json(
              { messageId: params.messageId, webhookId: params.webhookId },
              { status: 202 },
            )
          : HttpResponse.json(
              { status, title: 'Refused', code, detail: 'Refused by saas-api.' },
              { status },
            );
      },
    ),
  );
  return resends;
}

function renderResend(onQueued = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidated: unknown[] = [];
  const order: string[] = [];
  onQueued.mockImplementation(() => order.push('queued'));
  vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(
    async (filters) => {
      order.push('invalidate');
      invalidated.push(filters?.queryKey);
    },
  );
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  const { result } = renderHook(() => useResendWebhookMessage({ onQueued }), {
    wrapper: Wrapper,
  });
  const resend = () =>
    act(() =>
      result.current
        .mutateAsync({ webhookId: 'ep_orders', messageId: 'msg_1' })
        .catch(() => undefined),
    );

  return { invalidated, onQueued, order, resend };
}

beforeAll(() => {
  configureApiClient();
  i18n.addResourceBundle('en', 'translation', en, true, true);
});

afterEach(() => {
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

describe('useResendWebhookMessage', () => {
  it('calls onQueued, then invalidates the delivery queries, not the webhooks', async () => {
    const resends = serveResend(202);
    const { invalidated, onQueued, order, resend } = renderResend();

    await resend();

    expect(resends).toEqual(['ep_orders/msg_1']);
    expect(onQueued).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe('queued');
    expect(invalidated).toEqual(
      expect.arrayContaining([
        ['webhooks', 'history'],
        ['webhooks', 'messages-list', 'ep_orders'],
        ['webhooks', 'messages', 'ep_orders', 'msg_1'],
      ]),
    );
    expect(invalidated).not.toContainEqual(['webhooks']);
    expect(toastSuccessMock).toHaveBeenCalledWith(DETAIL.resendQueued);
  });

  it('says a gone payload in the console language and reads the message again', async () => {
    serveResend(409, 'ResendWebhookMessage.PayloadUnavailable');
    const { invalidated, onQueued, resend } = renderResend();

    await resend();

    expect(toastErrorMock).toHaveBeenCalledWith(DETAIL.resendPayloadUnavailable);
    expect(invalidated).toEqual([['webhooks', 'messages', 'ep_orders', 'msg_1']]);
    expect(onQueued).not.toHaveBeenCalled();
  });

  it('says a message no longer delivered in the console language', async () => {
    serveResend(404, 'ResendWebhookMessage.NotDelivered');
    const { invalidated, resend } = renderResend();

    await resend();

    expect(toastErrorMock).toHaveBeenCalledWith(DETAIL.resendNotDelivered);
    expect(invalidated).toEqual([['webhooks', 'messages', 'ep_orders', 'msg_1']]);
  });

  it.each([403, 500])('shows the API message of a %i, without reading again', async (status) => {
    serveResend(status);
    const { invalidated, resend } = renderResend();

    await resend();

    expect(toastErrorMock).toHaveBeenCalledWith('Refused by saas-api.');
    expect(invalidated).toEqual([]);
  });
});
