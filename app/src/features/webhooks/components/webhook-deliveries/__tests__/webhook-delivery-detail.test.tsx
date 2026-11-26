import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { http, HttpResponse } from 'msw/http';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { configureApiClient } from '@/lib/api/configure-api-client';
import en from '@/lib/i18n/locales/en';
import type { DeliveryWatch } from '../../../hooks/use-delivery-watch';
import type {
  WebhookDelivery,
  WebhookHistoryEntry,
  WebhookMessage,
} from '../../../types';
import {
  deliveryFromHistoryEntry,
  mapMessageSummaryToDelivery,
} from '../../../utils/webhook-deliveries';
import { WebhookDeliveryDetail } from '../webhook-delivery-detail';

const { scopes, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  scopes: { current: null as string[] | null },
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@/hooks/use-granted-scopes', () => ({
  useGrantedScopes: () => ({ isPending: false, scopes: scopes.current }),
}));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

const RELEASE_CREATED = 'com.kaiten.release.v1.created';

const entry: WebhookHistoryEntry = {
  date: '2026-11-25T10:00:00Z',
  hookId: 'ep_orders',
  hookUrl: 'https://api.example.com/hooks',
  eventType: RELEASE_CREATED,
  status: 'fail',
  responseStatusCode: 500,
  responseStatusText: 'Internal server error',
  messageId: 'msg_1',
  attemptId: 'atmpt_1',
  responseDurationMs: 1204,
  triggerType: 'scheduled',
};

const message: WebhookMessage = {
  messageId: 'msg_1',
  eventType: RELEASE_CREATED,
  timestamp: '2026-11-25T09:59:59Z',
  payloadAvailable: true,
  payload: { name: 'RELEASE_CREATED', data: { slug: 'v2-4-0' } },
  // Newest first, as saas-api sends them.
  attempts: [
    {
      id: 'atmpt_3',
      timestamp: '2026-11-25T12:00:00Z',
      status: 'success',
      responseStatusCode: 200,
      response: 'accepted',
      responseDurationMs: 84,
      triggerType: 'manual',
    },
    {
      id: 'atmpt_2',
      timestamp: '2026-11-25T11:00:00Z',
      status: 'fail',
      triggerType: 'scheduled',
    },
    {
      id: 'atmpt_1',
      timestamp: '2026-11-25T10:00:00Z',
      status: 'fail',
      responseStatusCode: 500,
      response: 'Internal server error',
      responseDurationMs: 1204,
      triggerType: 'scheduled',
    },
  ],
};

type MessageAnswer = WebhookMessage | { status: number; code: string };

/** Serves the message and the resend; records what reached the API. */
function serve(answer: MessageAnswer = message) {
  const requests: string[] = [];
  server.use(
    http.get('*/webhooks/:webhookId/messages/:messageId', ({ params }) => {
      requests.push(`GET ${String(params.messageId)}`);
      return 'code' in answer
        ? HttpResponse.json(
            { status: answer.status, title: 'Refused', code: answer.code, detail: 'Lookup failed.' },
            { status: answer.status },
          )
        : HttpResponse.json(answer);
    }),
    http.post(
      '*/webhooks/:webhookId/messages/:messageId/resend',
      ({ params }) => {
        requests.push(`POST ${String(params.messageId)}`);
        return HttpResponse.json(
          { messageId: params.messageId, webhookId: params.webhookId },
          { status: 202 },
        );
      },
    ),
  );
  return requests;
}

function renderDetail(
  delivery: WebhookDelivery,
  { initialAttemptId }: { initialAttemptId?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } },
  });
  const watch: DeliveryWatch = {
    arm: vi.fn(),
    refetchInterval: () => false,
  };
  render(
    <QueryClientProvider client={queryClient}>
      <WebhookDeliveryDetail
        delivery={delivery}
        initialAttemptId={initialAttemptId}
        watch={watch}
      />
    </QueryClientProvider>,
  );
  return { watch };
}

const resendButton = () => screen.getByRole('button', { name: /^Resend/ });
const responseTitle = () =>
  screen.getByRole('heading', { name: /^Response · attempt/ });

beforeAll(() => {
  configureApiClient();
  i18n.addResourceBundle('en', 'translation', en, true, true);
});

beforeEach(() => {
  scopes.current = null;
});

afterEach(() => {
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

describe('WebhookDeliveryDetail', () => {
  it('shows the body as pretty JSON, with its caption, and copies it', async () => {
    serve();
    // After setup: user-event installs a clipboard of its own.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderDetail(deliveryFromHistoryEntry(entry));

    const body = await screen.findByRole('region', {
      name: 'Body sent, as JSON',
    });
    expect(body).toHaveTextContent('"slug": "v2-4-0"');
    expect(body).toHaveAttribute('tabindex', '0');
    expect(screen.getByText(/not byte-identical/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy body' }));

    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify(message.payload, null, 2),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith('Body copied');
  });

  it('opens on the clicked attempt, oldest first, and switches attempts', async () => {
    serve();
    const user = userEvent.setup();
    renderDetail(deliveryFromHistoryEntry(entry), {
      initialAttemptId: 'atmpt_1',
    });

    await screen.findByRole('region', { name: 'Body sent, as JSON' });
    expect(responseTitle()).toHaveTextContent('Response · attempt 1 of 3');
    expect(
      screen.getByRole('button', { name: 'Show attempt 1' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('region', { name: 'Response body of the endpoint' }),
    ).toHaveTextContent('Internal server error');

    await user.click(screen.getByRole('button', { name: 'Show attempt 2' }));

    expect(responseTitle()).toHaveTextContent('Response · attempt 2 of 3');
    expect(screen.getByText('The endpoint did not answer.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show attempt 3' }));

    expect(screen.getByText('Resent manually')).toBeInTheDocument();
  });

  it("takes its status from the message's newest attempt, not the clicked one", async () => {
    serve();
    renderDetail(deliveryFromHistoryEntry(entry), {
      initialAttemptId: 'atmpt_1',
    });

    await screen.findByRole('region', { name: 'Body sent, as JSON' });
    const heading = screen.getByRole('heading', { name: 'Release published' });
    const head = heading.parentElement as HTMLElement;

    expect(within(head).getByText('OK')).toBeInTheDocument();
    expect(within(head).getByText('RELEASE_CREATED')).toBeInTheDocument();
  });

  it('reads a list message awaiting a retry as retrying', async () => {
    serve({ ...message, attempts: [message.attempts[2]] });
    renderDetail(
      mapMessageSummaryToDelivery(
        {
          messageId: 'msg_1',
          eventType: RELEASE_CREATED,
          timestamp: '2026-11-25T09:59:59Z',
          status: 'pending',
          nextAttempt: '2026-11-25T13:00:00Z',
          attemptCount: 1,
          lastAttempt: { ...message.attempts[2], response: undefined },
        },
        'ep_orders',
      ),
    );

    await screen.findByRole('region', { name: 'Body sent, as JSON' });
    const head = screen.getByRole('heading', { name: 'Release published' })
      .parentElement as HTMLElement;

    expect(within(head).getByText('Retrying')).toBeInTheDocument();
  });

  it('says the body is gone and refuses to resend it', async () => {
    serve({ ...message, payload: null, payloadAvailable: false });
    renderDetail(deliveryFromHistoryEntry(entry));

    expect(await screen.findByText('Body no longer available')).toBeInTheDocument();
    expect(resendButton()).toBeDisabled();
    expect(responseTitle()).toBeInTheDocument();
  });

  it('tells a delivery not found apart from an expired body', async () => {
    serve({ status: 404, code: 'GetWebhookMessage.MessageNotFound' });
    renderDetail(deliveryFromHistoryEntry(entry));

    expect(
      await screen.findByText(/This delivery can no longer be found/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Body no longer available')).not.toBeInTheDocument();
    expect(resendButton()).toBeDisabled();
  });

  it('titles the body of a chat endpoint as its event', async () => {
    serve({ ...message, chatService: 'Slack' });
    renderDetail(deliveryFromHistoryEntry(entry));

    expect(
      await screen.findByRole('heading', { name: 'Event' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/receives a Slack message/)).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Event, as JSON' }),
    ).toBeInTheDocument();
  });

  it('shows a failed read with Retry, the attempts staying usable', async () => {
    const requests = serve({ status: 500, code: 'GetWebhookMessage.LookupFailed' });
    const user = userEvent.setup();
    renderDetail(deliveryFromHistoryEntry(entry));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load the body.');
    expect(alert).toHaveTextContent('Lookup failed.');
    expect(responseTitle()).toHaveTextContent('Response · attempt 1 of 1');
    const reads = requests.length;

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(requests.length).toBeGreaterThan(reads));
  });

  it('reads nothing without a message id and shows the history attempt', async () => {
    const requests = serve();
    const legacy = { ...entry, messageId: undefined, attemptId: undefined };
    renderDetail(deliveryFromHistoryEntry(legacy), {
      initialAttemptId: legacy.date,
    });

    expect(
      screen.getByText(/does not report the message of a delivery/),
    ).toBeInTheDocument();
    expect(responseTitle()).toHaveTextContent('Response · attempt 1 of 1');
    expect(resendButton()).toBeDisabled();
    expect(requests).toEqual([]);
  });

  it('disables Resend without write:webhooks', async () => {
    scopes.current = ['read:webhooks'];
    serve();
    renderDetail(deliveryFromHistoryEntry(entry));

    await screen.findByRole('region', { name: 'Body sent, as JSON' });

    expect(resendButton()).toBeDisabled();
  });

  it('disables Resend while the newest attempt is being sent', async () => {
    serve({
      ...message,
      attempts: [
        { id: 'atmpt_4', timestamp: '2026-11-25T13:00:00Z', status: 'sending', triggerType: 'manual' },
        ...message.attempts,
      ],
    });
    renderDetail(deliveryFromHistoryEntry(entry));

    await screen.findByRole('region', { name: 'Body sent, as JSON' });

    expect(resendButton()).toBeDisabled();
  });

  it('resends once and arms the watch', async () => {
    scopes.current = ['write:webhooks'];
    const requests = serve();
    const user = userEvent.setup();
    const { watch } = renderDetail(deliveryFromHistoryEntry(entry));
    await screen.findByRole('region', { name: 'Body sent, as JSON' });

    await user.click(resendButton());

    await waitFor(() => expect(watch.arm).toHaveBeenCalledTimes(1));
    expect(requests.filter((request) => request.startsWith('POST'))).toEqual([
      'POST msg_1',
    ]);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Resend queued. The new attempt will appear shortly.',
    );
  });
});
