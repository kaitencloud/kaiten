import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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

/** A failed message the provider serves, and how its resends settle. */
interface ServedMessage {
  messageId: string;
  /** Its publication time: the newest is selected first in the dialog. */
  timestamp: string;
  /** How long after each resend its attempt is recorded. */
  settleMs: number;
  /** An earlier failed attempt, which the list does not carry. */
  withOlder?: boolean;
}

const firstMessage: ServedMessage = {
  messageId: 'msg_1',
  timestamp: '2026-11-26T11:57:00Z',
  settleMs: 0,
};

/** An older failed message of the same webhook. */
const olderMessage: ServedMessage = {
  messageId: 'msg_0',
  timestamp: '2026-11-26T11:56:00Z',
  settleMs: 0,
};

/**
 * The delivery provider as the review describes it: failed messages, and a
 * resend whose attempt is recorded only once it completes, `settleMs` after
 * the resend. Until then the message stays failed with its attempts; never
 * sending. A list read without attempts carries no attempt count and no last
 * attempt, as saas-api answers. `messageDelayMs` slows the message's reads.
 * Records the query of each read of the list and each message's reads.
 */
function serveProvider({
  messages = [firstMessage],
  settleMs,
  withOlder = false,
  messageDelayMs = 0,
}: {
  messages?: ServedMessage[];
  settleMs?: number;
  withOlder?: boolean;
  messageDelayMs?: number;
}) {
  const served = messages.map((message) => ({
    ...message,
    settleMs: settleMs ?? message.settleMs,
    withOlder: message.withOlder ?? withOlder,
    resentAt: undefined as number | undefined,
  }));
  const listReads: string[] = [];
  const messageReads: string[] = [];
  const find = (messageId: unknown) =>
    served.find((message) => message.messageId === messageId) ?? served[0];
  const failedOf = (message: (typeof served)[number]) =>
    message.messageId === 'msg_1'
      ? failedAttempt
      : { ...failedAttempt, id: `${message.messageId}_atmpt_1` };
  const attempts = (
    message: (typeof served)[number],
  ): WebhookMessageAttempt[] => {
    const known = [
      failedOf(message),
      ...(message.withOlder ? [olderAttempt] : []),
    ];
    const { resentAt } = message;
    if (resentAt === undefined || Date.now() < resentAt + message.settleMs) {
      return known;
    }
    return [
      {
        id: message.messageId === 'msg_1' ? 'atmpt_2' : `${message.messageId}_atmpt_2`,
        timestamp: new Date(resentAt + message.settleMs).toISOString(),
        status: 'success',
        responseStatusCode: 200,
        responseDurationMs: 84,
        triggerType: 'manual',
      },
      ...known,
    ];
  };

  server.use(
    http.get('*/webhooks/:webhookId/messages', ({ request }) => {
      const query = new URL(request.url).searchParams;
      listReads.push(new URL(request.url).search);
      const withAttempts = query.get('withAttempts') !== 'false';
      const latest = served.map((message) => attempts(message)[0]);
      const delivered = latest.filter(
        (attempt) => attempt.status === 'success',
      ).length;
      const answer: WebhookMessageList = {
        webhook: {
          id: webhook.id,
          url: webhook.url,
          createdAt: webhook.createdAt,
          updatedAt: webhook.createdAt,
        },
        messages: served.map((message, index) => ({
          messageId: message.messageId,
          eventType: 'com.kaiten.instance.v1.created',
          timestamp: message.timestamp,
          status: latest[index].status,
          ...(withAttempts
            ? {
                attemptCount: attempts(message).length,
                lastAttempt: latest[index],
              }
            : {}),
        })),
        summary: {
          total: served.length,
          delivered,
          failed: served.length - delivered,
          pending: 0,
        },
        hasMore: false,
      };
      return HttpResponse.json(answer);
    }),
    http.get(
      '*/webhooks/:webhookId/messages/:messageId',
      async ({ params }) => {
        messageReads.push(String(params.messageId));
        await delay(messageDelayMs);
        const message = find(params.messageId);
        return HttpResponse.json({
          messageId: message.messageId,
          eventType: 'com.kaiten.instance.v1.created',
          payloadAvailable: true,
          payload: { id: `evt_${message.messageId}` },
          attempts: attempts(message),
        });
      },
    ),
    http.post(
      '*/webhooks/:webhookId/messages/:messageId/resend',
      ({ params }) => {
        const message = find(params.messageId);
        message.resentAt = Date.now();
        return HttpResponse.json(
          { messageId: message.messageId, webhookId: webhook.id },
          { status: 202 },
        );
      },
    ),
  );

  return { listReads, messageReads };
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
/**
 * Stands for the app around the History dialog (the History table, the
 * shell), which goes on reading from the query client once the dialog closes.
 */
function AppAround() {
  useQuery({ queryKey: ['app'], queryFn: () => null, staleTime: Infinity });
  return null;
}

function renderHistoryDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  const view = (open: boolean) => (
    <QueryClientProvider client={queryClient}>
      <AppAround />
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

/** The chronology's button of a message, in the deliveries dialog. */
function deliveryButton(messageId: string): HTMLElement {
  const button = document.querySelector<HTMLElement>(
    `button[data-delivery-key="${webhook.id}:${messageId}"]`,
  );
  if (!button) {
    throw new Error(`no delivery ${messageId} in the chronology`);
  }
  return button;
}

async function select(messageId: string) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(deliveryButton(messageId));
}

/** The status the detail's head shows: its first badge. */
function detailStatus() {
  return screen
    .getByTestId('webhook-delivery-detail')
    .querySelector('[data-status]')
    ?.getAttribute('data-status');
}

describe('resends of several messages from the deliveries dialog', () => {
  const twoRate = () => screen.getByText(/^\d+ \/ 2 delivered/);

  it('shows each message settled when shown again, both attempts settling at once', async () => {
    serveProvider({
      messages: [
        { ...firstMessage, settleMs: 1_500 },
        { ...olderMessage, settleMs: 1_500 },
      ],
    });
    renderRowAndDialog();
    await waitFor(() => expect(twoRate()).toHaveTextContent(/^0 \/ 2/));

    // The newest, msg_1, is selected first: resent, then msg_0 2 s later.
    await resend();
    await advance(1_000);
    await select('msg_0');
    await advance(1_000);
    await resend();
    await advance(10_000);

    await select('msg_1');
    await advance(1_000);
    expect(await screen.findByText(/attempt 2 of 2/)).toBeInTheDocument();
    expect(detailStatus()).toBe('success');
    expect(within(deliveryButton('msg_1')).getByText(/2 attempts/)).toBeInTheDocument();
    expect(twoRate()).toHaveTextContent(/^2 \/ 2 delivered/);
  });

  it('follows the first message resent when a second one settles first', async () => {
    serveProvider({
      messages: [
        { ...firstMessage, settleMs: 8_000 },
        { ...olderMessage, settleMs: 1_500 },
      ],
    });
    renderRowAndDialog();
    await waitFor(() => expect(rowSummary('2 failures')).toBeInTheDocument());
    await waitFor(() => expect(twoRate()).toHaveTextContent(/^0 \/ 2/));

    await resend();
    await advance(1_000);
    await select('msg_0');
    await advance(1_000);
    await resend();
    await advance(20_000);

    expect(twoRate()).toHaveTextContent(/^2 \/ 2 delivered/);
    expect(
      within(deliveryButton('msg_1')).getByText(/^200 · 84 ms/),
    ).toBeInTheDocument();
    expect(rowSummary('all delivered')).toBeInTheDocument();
  });
});

describe("a resend followed with only the row's strip on screen", () => {
  it('ends a read or two after the attempt settles, once the dialog is closed', async () => {
    const { listReads, messageReads } = serveProvider({ settleMs: 10_000 });
    const { close } = renderRowAndDialog();
    await waitFor(() => expect(rowSummary('1 failure')).toBeInTheDocument());
    await waitFor(() => expect(dialogRate()).toHaveTextContent(/^0 \/ 1/));

    await resend();
    const resentAt = Date.now();
    await advance(2_000);
    close();
    // Past the settle at 10 s, short of the next tick.
    await advance(10_000 - (Date.now() - resentAt) + 100);
    const stripReads = () =>
      listReads.filter((search) => search.includes('withAttempts=false'))
        .length;
    const readsAtSettle = stripReads();
    const messageReadsAtSettle = messageReads.length;

    await advance(60_000);
    expect(rowSummary('all delivered')).toBeInTheDocument();
    // The tick that sees the attempt, then the read that follows its end.
    expect(stripReads() - readsAtSettle).toBeLessThanOrEqual(2);
    expect(messageReads.length - messageReadsAtSettle).toBeLessThanOrEqual(1);
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
