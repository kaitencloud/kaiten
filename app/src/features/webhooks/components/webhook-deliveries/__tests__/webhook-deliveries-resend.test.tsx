import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { delay } from 'msw';
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
import type {
  Webhook,
  WebhookHistoryEntry,
  WebhookMessageAttempt,
  WebhookMessageList,
} from '../../../types';
import { deliveryFromHistoryEntry } from '../../../utils/webhook-deliveries';
import { WebhookDeliveriesCell } from '../webhook-deliveries-cell';
import { WebhookDeliveriesDialog } from '../webhook-deliveries-dialog';
import { WebhookDeliveryDetailDialog } from '../webhook-delivery-detail-dialog';

vi.mock('@/hooks/use-granted-scopes', () => ({
  useGrantedScopes: () => ({ isPending: false, scopes: ['write:webhooks'] }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const NOW = new Date('2026-11-26T12:00:00Z');

const webhook: Webhook = {
  id: 'ep_orders',
  url: 'https://api.example.com/hooks/orders',
  eventTypes: ['com.kaiten.instance.v1.created'],
  createdAt: '2026-11-01T09:00:00Z',
};

const failedAttempt: WebhookMessageAttempt = {
  id: 'atmpt_1',
  timestamp: '2026-11-26T11:57:01Z',
  status: 'fail',
  responseStatusCode: 503,
  triggerType: 'scheduled',
};

/** An earlier failed attempt of the same message, which the list does not carry. */
const olderAttempt: WebhookMessageAttempt = {
  id: 'atmpt_0',
  timestamp: '2026-11-26T11:57:00Z',
  status: 'fail',
  responseStatusCode: 503,
  triggerType: 'scheduled',
};

/**
 * The delivery provider as the review describes it: one failed message, and a
 * resend whose attempt is recorded only once it completes, `settleMs` after
 * the resend. Until then the message stays failed with its attempts; never
 * sending. `withOlder` adds an earlier failed attempt, and `messageDelayMs`
 * slows the message's reads. Records the query of each read of the list.
 */
function serveProvider({
  settleMs,
  withOlder = false,
  messageDelayMs = 0,
}: {
  settleMs: number;
  withOlder?: boolean;
  messageDelayMs?: number;
}) {
  let resentAt: number | undefined;
  const listReads: string[] = [];
  const attempts = (): WebhookMessageAttempt[] =>
    resentAt !== undefined && Date.now() >= resentAt + settleMs
      ? [
          {
            id: 'atmpt_2',
            timestamp: new Date(resentAt + settleMs).toISOString(),
            status: 'success',
            responseStatusCode: 200,
            responseDurationMs: 84,
            triggerType: 'manual',
          },
          failedAttempt,
          ...(withOlder ? [olderAttempt] : []),
        ]
      : [failedAttempt, ...(withOlder ? [olderAttempt] : [])];

  server.use(
    http.get('*/webhooks/:webhookId/messages', ({ request }) => {
      listReads.push(new URL(request.url).search);
      const [latest] = attempts();
      const delivered = latest.status === 'success';
      const answer: WebhookMessageList = {
        webhook: {
          id: webhook.id,
          url: webhook.url,
          createdAt: webhook.createdAt,
          updatedAt: webhook.createdAt,
        },
        messages: [
          {
            messageId: 'msg_1',
            eventType: 'com.kaiten.instance.v1.created',
            timestamp: '2026-11-26T11:57:00Z',
            status: latest.status,
            attemptCount: attempts().length,
            lastAttempt: latest,
          },
        ],
        summary: {
          total: 1,
          delivered: delivered ? 1 : 0,
          failed: delivered ? 0 : 1,
          pending: 0,
        },
        hasMore: false,
      };
      return HttpResponse.json(answer);
    }),
    http.get('*/webhooks/:webhookId/messages/:messageId', async () => {
      await delay(messageDelayMs);
      return HttpResponse.json({
        messageId: 'msg_1',
        eventType: 'com.kaiten.instance.v1.created',
        payloadAvailable: true,
        payload: { id: 'evt_1' },
        attempts: attempts(),
      });
    }),
    http.post('*/webhooks/:webhookId/messages/:messageId/resend', () => {
      resentAt = Date.now();
      return HttpResponse.json(
        { messageId: 'msg_1', webhookId: webhook.id },
        { status: 202 },
      );
    }),
  );

  return { listReads };
}

/** The row's cell and the open dialog under one client, as on the page. */
function renderRowAndDialog() {
  const queryClient = new QueryClient({
    // The app's default staleTime: a remount alone reads nothing again.
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  const view = (open: boolean) => (
    <QueryClientProvider client={queryClient}>
      <WebhookDeliveriesCell onOpen={vi.fn()} webhook={webhook} />
      <WebhookDeliveriesDialog
        onOpenChange={vi.fn()}
        open={open}
        webhook={webhook}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(view(true));

  return {
    close: () => rerender(view(false)),
    reopen: () => rerender(view(true)),
  };
}

/** The History tab's clicked attempt: the message's failed one. */
const historyEntry: WebhookHistoryEntry = {
  date: failedAttempt.timestamp,
  hookId: webhook.id,
  hookUrl: webhook.url,
  eventType: 'com.kaiten.instance.v1.created',
  status: 'fail',
  responseStatusCode: 503,
  messageId: 'msg_1',
  attemptId: failedAttempt.id,
  triggerType: 'scheduled',
};

/** The History tab's dialog, which stays mounted while closed. */
function renderHistoryDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  const view = (open: boolean) => (
    <QueryClientProvider client={queryClient}>
      <WebhookDeliveryDetailDialog
        delivery={deliveryFromHistoryEntry(historyEntry)}
        initialAttemptId={historyEntry.attemptId}
        onOpenChange={vi.fn()}
        open={open}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(view(true));

  return {
    close: () => rerender(view(false)),
    reopen: () => rerender(view(true)),
  };
}

const rowSummary = (outcome: string) =>
  screen.getByText(`3 minutes ago · ${outcome}`);
const dialogRate = () => screen.getByText(/^\d+ \/ 1 delivered/);

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

async function resend() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const button = await screen.findByRole('button', { name: /^Resend/ });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

beforeAll(() => {
  configureApiClient();
  i18n.addResourceBundle('en', 'translation', en, true, true);
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a resend from the deliveries dialog', () => {
  it("brings the row's strip up to date while the dialog is open, and after it closes", async () => {
    serveProvider({ settleMs: 1_000 });
    const { close } = renderRowAndDialog();
    await waitFor(() => expect(rowSummary('1 failure')).toBeInTheDocument());
    await waitFor(() => expect(dialogRate()).toHaveTextContent(/^0 \/ 1/));

    await resend();
    await advance(4_000);

    expect(dialogRate()).toHaveTextContent(/^1 \/ 1 delivered/);
    expect(rowSummary('all delivered')).toBeInTheDocument();

    close();
    await advance(1_000);
    expect(rowSummary('all delivered')).toBeInTheDocument();
  });

  it('shows an attempt that settles 17 s after the resend, then stops reading', async () => {
    const { listReads } = serveProvider({ settleMs: 17_000 });
    renderRowAndDialog();
    await waitFor(() => expect(dialogRate()).toHaveTextContent(/^0 \/ 1/));

    await resend();
    await advance(15_000);
    expect(dialogRate()).toHaveTextContent(/^0 \/ 1/);

    await advance(6_000);
    expect(dialogRate()).toHaveTextContent(/^1 \/ 1 delivered/);
    expect(screen.getByText('Resent manually')).toBeInTheDocument();
    expect(rowSummary('all delivered')).toBeInTheDocument();

    const reads = listReads.length;
    await advance(60_000);
    expect(listReads).toHaveLength(reads);
  });

  it('is not ended by an earlier attempt when pressed before the message is read', async () => {
    serveProvider({ settleMs: 6_000, withOlder: true, messageDelayMs: 2_000 });
    renderRowAndDialog();
    await waitFor(() => expect(dialogRate()).toHaveTextContent(/^0 \/ 1/));
    // The detail still shows the list's one attempt: the message is not read.
    expect(screen.getByText(/attempt 1 of 1/)).toBeInTheDocument();

    await resend();
    await advance(30_000);

    expect(dialogRate()).toHaveTextContent(/^1 \/ 1 delivered/);
    expect(rowSummary('all delivered')).toBeInTheDocument();
  });

  it("brings the row's strip up to date when the attempt settles after the dialog closed", async () => {
    const { listReads } = serveProvider({ settleMs: 10_000 });
    const { close } = renderRowAndDialog();
    await waitFor(() => expect(rowSummary('1 failure')).toBeInTheDocument());
    await waitFor(() => expect(dialogRate()).toHaveTextContent(/^0 \/ 1/));

    await resend();
    await advance(2_000);
    close();
    await advance(15_000);

    expect(rowSummary('all delivered')).toBeInTheDocument();
    await advance(60_000);
    const reads = listReads.length;
    await advance(60_000);
    expect(listReads).toHaveLength(reads);
  });

  it('shows the settled attempt in a dialog opened again before it settles', async () => {
    serveProvider({ settleMs: 10_000 });
    const { close, reopen } = renderRowAndDialog();
    await waitFor(() => expect(dialogRate()).toHaveTextContent(/^0 \/ 1/));

    await resend();
    await advance(2_000);
    close();
    await advance(3_000);
    reopen();
    await advance(20_000);

    expect(dialogRate()).toHaveTextContent(/^1 \/ 1 delivered/);
    expect(screen.getByText(/attempt 2 of 2/)).toBeInTheDocument();
    expect(screen.getByText('Resent manually')).toBeInTheDocument();
    expect(rowSummary('all delivered')).toBeInTheDocument();
  });
});

describe('a resend from the History dialog', () => {
  it('shows the settled attempt when the dialog is opened again before it settles', async () => {
    serveProvider({ settleMs: 10_000 });
    const { close, reopen } = renderHistoryDialog();
    await waitFor(() =>
      expect(screen.getByText(/attempt 1 of 1/)).toBeInTheDocument(),
    );

    await resend();
    await advance(2_000);
    close();
    await advance(3_000);
    reopen();
    await advance(20_000);

    // The clicked attempt stays selected: the message now counts two.
    expect(await screen.findByText(/attempt 1 of 2/)).toBeInTheDocument();
  });
});
