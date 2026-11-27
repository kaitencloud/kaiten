import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
import type {
  Webhook,
  WebhookMessageList,
  WebhookMessageSummary,
} from '../../../types';
import { WebhookDeliveriesCell } from '../webhook-deliveries-cell';

const NOW = new Date('2026-11-26T12:00:00Z');

const webhook: Webhook = {
  id: 'ep_orders',
  url: 'https://api.example.com/hooks/orders',
  eventTypes: ['com.kaiten.instance.v1.created'],
  createdAt: '2026-11-01T09:00:00Z',
};

/** `count` messages, newest first, one per minute back from `newest`. */
function messages(
  count: number,
  statusAt: (index: number) => WebhookMessageSummary['status'] = () =>
    'success',
  newest = '2026-11-26T11:57:00Z',
): WebhookMessageSummary[] {
  const start = Date.parse(newest);
  return Array.from({ length: count }, (_, index) => ({
    messageId: `msg_${String(index).padStart(2, '0')}`,
    eventType: 'com.kaiten.instance.v1.created',
    timestamp: new Date(start - index * 60_000).toISOString(),
    status: statusAt(index),
  }));
}

function list(items: WebhookMessageSummary[]): WebhookMessageList {
  const count = (status: string) =>
    items.filter((item) => item.status === status).length;
  return {
    webhook: {
      id: webhook.id,
      url: webhook.url,
      createdAt: webhook.createdAt,
      updatedAt: webhook.createdAt,
    },
    messages: items,
    summary: {
      total: items.length,
      delivered: count('success'),
      failed: count('fail'),
      pending: count('pending') + count('sending'),
    },
    hasMore: false,
  };
}

type Answer = WebhookMessageList | { status: number };

/** Serves the list, answer after answer; records the query of each read. */
function serve(...answers: Answer[]) {
  const reads: string[] = [];
  server.use(
    http.get('*/webhooks/:webhookId/messages', ({ request }) => {
      reads.push(new URL(request.url).search);
      const answer = answers[Math.min(reads.length, answers.length) - 1];
      return 'status' in answer
        ? HttpResponse.json(
            { status: answer.status, title: 'Error', code: 'GetWebhookMessages.LookupFailed' },
            { status: answer.status },
          )
        : HttpResponse.json(answer);
    }),
  );
  return reads;
}

function renderCell(onOpen = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  const onRowClick = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      {/* The row a click must not reach. */}
      <div onClick={onRowClick}>
        <WebhookDeliveriesCell onOpen={onOpen} webhook={webhook} />
      </div>
    </QueryClientProvider>,
  );
  return { onOpen, onRowClick };
}

const openButton = () =>
  screen.findByRole('button', { name: /^Deliveries of api\.example\.com: / });

beforeAll(() => {
  configureApiClient();
  i18n.addResourceBundle('en', 'translation', en, true, true);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WebhookDeliveriesCell', () => {
  it('draws a busy skeleton, then reads the 20 most recent messages without attempts', async () => {
    const reads = serve(list(messages(3)));
    renderCell();

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    await openButton();
    expect(reads).toEqual(['?limit=20&withAttempts=false']);
  });

  it('says when the newest delivery was and how many failed', async () => {
    serve(list(messages(6, (index) => (index % 3 === 1 ? 'fail' : 'success'))));
    renderCell();

    expect(await openButton()).toHaveAccessibleName(
      'Deliveries of api.example.com: 3 minutes ago · 2 failures. Open details.',
    );
    expect(screen.getByText('3 minutes ago · 2 failures')).toBeInTheDocument();
  });

  it('reads yesterday and all delivered when nothing failed', async () => {
    serve(list(messages(2, () => 'success', '2026-11-25T11:00:00Z')));
    renderCell();

    await openButton();
    expect(screen.getByText('yesterday · all delivered')).toBeInTheDocument();
  });

  it('says retrying for a failed message that waits for a retry', async () => {
    const items = messages(2);
    items[0] = {
      ...items[0],
      status: 'pending',
      nextAttempt: '2026-11-26T12:30:00Z',
    };
    serve(list(items));
    renderCell();

    await openButton();
    expect(screen.getByText('3 minutes ago · 1 retrying')).toBeInTheDocument();
    expect(
      screen.getByTestId('webhook-deliveries-strip').lastElementChild,
    ).toHaveAttribute('data-status', 'retrying');
  });

  it('draws one bar per message, oldest on the left, at most 20', async () => {
    serve(list(messages(25, (index) => (index === 0 ? 'fail' : 'success'))));
    renderCell();

    await openButton();
    const bars = screen.getByTestId('webhook-deliveries-strip').children;
    expect(bars).toHaveLength(20);
    expect(bars[19]).toHaveAttribute('data-status', 'fail');
    expect(bars[0]).toHaveAttribute('data-status', 'success');
  });

  it('opens the dialog on click, without reaching the row', async () => {
    const user = userEvent.setup();
    serve(list(messages(1)));
    const { onOpen, onRowClick } = renderCell();

    await user.click(await openButton());

    expect(onOpen).toHaveBeenCalledWith('ep_orders');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('says so when the webhook has no delivery yet', async () => {
    serve(list([]));
    renderCell();

    expect(await screen.findByText('No deliveries yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the failure after one retry, and Retry reads again', async () => {
    const user = userEvent.setup();
    const reads = serve({ status: 500 }, { status: 500 }, list(messages(1)));
    renderCell();

    expect(
      await screen.findByText('Deliveries unavailable'),
    ).toBeInTheDocument();
    expect(reads).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await openButton();
    await waitFor(() => expect(reads).toHaveLength(3));
  });
});
