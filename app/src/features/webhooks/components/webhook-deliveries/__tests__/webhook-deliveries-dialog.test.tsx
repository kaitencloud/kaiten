import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { http, HttpResponse } from 'msw/http';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { configureApiClient } from '@/lib/api/configure-api-client';
import en from '@/lib/i18n/locales/en';
import type {
  Webhook,
  WebhookMessageList,
  WebhookMessageSummary,
} from '../../../types';
import { WebhookDeliveriesDialog } from '../webhook-deliveries-dialog';

vi.mock('@/hooks/use-granted-scopes', () => ({
  useGrantedScopes: () => ({ isPending: false, scopes: null }),
}));

const webhook: Webhook = {
  id: 'ep_orders',
  url: 'https://api.example.com/hooks/orders',
  eventTypes: ['com.kaiten.instance.v1.created'],
  createdAt: '2026-11-01T09:00:00Z',
};

const delivered: WebhookMessageSummary = {
  messageId: 'msg_delivered',
  eventType: 'com.kaiten.instance.v1.created',
  timestamp: '2026-11-26T10:00:00Z',
  status: 'success',
  attemptCount: 1,
  lastAttempt: {
    id: 'atmpt_delivered',
    timestamp: '2026-11-26T10:00:01Z',
    status: 'success',
    responseStatusCode: 200,
    responseDurationMs: 84,
    triggerType: 'scheduled',
  },
};

const failed: WebhookMessageSummary = {
  messageId: 'msg_failed',
  eventType: 'com.kaiten.gadget.v1.created',
  timestamp: '2026-11-26T11:00:00Z',
  status: 'fail',
  attemptCount: 3,
  lastAttempt: {
    id: 'atmpt_failed',
    timestamp: '2026-11-26T11:30:00Z',
    status: 'fail',
    responseStatusCode: 503,
    triggerType: 'scheduled',
  },
};

const lost: WebhookMessageSummary = {
  messageId: 'msg_lost',
  eventType: '',
  timestamp: '2026-11-26T09:00:00Z',
  status: 'success',
};

function list(
  items: WebhookMessageSummary[],
  dates: Partial<WebhookMessageList['webhook']> = {},
): WebhookMessageList {
  return {
    webhook: {
      id: webhook.id,
      url: webhook.url,
      createdAt: '2026-11-01T09:00:00Z',
      updatedAt: '2026-11-20T16:00:00Z',
      ...dates,
    },
    messages: items,
    summary: {
      total: items.length,
      delivered: items.filter((item) => item.status === 'success').length,
      failed: items.filter((item) => item.status === 'fail').length,
      pending: 0,
    },
    hasMore: false,
  };
}

/** Serves the list and each message; records what reached the API. */
function serve(answer: WebhookMessageList | { status: number }) {
  const reads: string[] = [];
  server.use(
    http.get('*/webhooks/:webhookId/messages', ({ request }) => {
      reads.push(`list${new URL(request.url).search}`);
      return 'status' in answer
        ? HttpResponse.json(
            { status: answer.status, title: 'Error', detail: 'Svix is down.' },
            { status: answer.status },
          )
        : HttpResponse.json(answer);
    }),
    http.get('*/webhooks/:webhookId/messages/:messageId', ({ params }) => {
      reads.push(`message ${String(params.messageId)}`);
      return HttpResponse.json({
        messageId: params.messageId,
        payloadAvailable: true,
        payload: { id: params.messageId },
        attempts: [],
      });
    }),
  );
  return reads;
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <WebhookDeliveriesDialog
        onOpenChange={onOpenChange}
        open
        webhook={webhook}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, queryClient };
}

const chronology = () => screen.findByRole('list', { name: 'Deliveries' });

function deliveryButtons(list: HTMLElement) {
  return within(list).getAllByRole('button');
}

beforeAll(() => {
  configureApiClient();
  i18n.addResourceBundle('en', 'translation', en, true, true);
});

describe('WebhookDeliveriesDialog', () => {
  it('reads 50 messages with their attempts, and shows the rate over them', async () => {
    const reads = serve(list([delivered, failed]));
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Deliveries' });
    expect(dialog).toHaveAccessibleDescription(
      'https://api.example.com/hooks/orders',
    );
    expect(
      await screen.findByText('1 / 2 delivered · 50%'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Over the 2 most recent deliveries of this webhook.',
      ),
    ).toBeInTheDocument();
    expect(reads[0]).toBe('list?limit=50&withAttempts=true');
  });

  it('lists the deliveries newest first, then the update and the creation', async () => {
    serve(list([delivered, lost, failed]));
    renderDialog();

    const items = within(await chronology()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('com.kaiten.gadget.v1.created503 · 3 attempts'),
      expect.stringContaining('Instance created200 · 84 ms'),
      expect.stringContaining('Unknown event'),
      expect.stringContaining('Webhook updated'),
      expect.stringContaining('Webhook created'),
    ]);
  });

  it('selects the newest delivery first, then the one clicked or chosen by Enter', async () => {
    const user = userEvent.setup();
    const reads = serve(list([delivered, failed]));
    renderDialog();

    const [newest, older] = deliveryButtons(await chronology());
    expect(newest).toHaveAttribute('aria-current', 'true');
    await waitFor(() => expect(reads).toContain('message msg_failed'));

    await user.click(older);
    expect(older).toHaveAttribute('aria-current', 'true');
    expect(newest).not.toHaveAttribute('aria-current');
    await waitFor(() => expect(reads).toContain('message msg_delivered'));

    newest.focus();
    await user.keyboard('{Enter}');
    expect(newest).toHaveAttribute('aria-current', 'true');
  });

  it('moves the focus with the arrow keys without selecting', async () => {
    const user = userEvent.setup();
    serve(list([delivered, failed, lost]));
    renderDialog();

    const buttons = deliveryButtons(await chronology());
    buttons[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(buttons[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(buttons[2]).toHaveFocus();
    await user.keyboard('{ArrowUp}{Home}');
    expect(buttons[0]).toHaveFocus();
    expect(buttons[0]).toHaveAttribute('aria-current', 'true');
    expect(buttons[2]).not.toHaveAttribute('aria-current');
  });

  it('shows the detail on a phone once a delivery is chosen, and goes back', async () => {
    const user = userEvent.setup();
    serve(list([delivered, failed]));
    renderDialog();

    const list_ = await chronology();
    const listPane = list_.parentElement as HTMLElement;
    const detailPane = screen.getByTestId('webhook-delivery-detail')
      .parentElement as HTMLElement;
    expect(listPane).not.toHaveClass('max-md:hidden');
    expect(detailPane).toHaveClass('max-md:hidden');

    await user.click(deliveryButtons(list_)[1]);
    expect(listPane).toHaveClass('max-md:hidden');
    expect(detailPane).not.toHaveClass('max-md:hidden');

    await user.click(screen.getByRole('button', { name: 'Back to deliveries' }));
    expect(listPane).not.toHaveClass('max-md:hidden');
    expect(detailPane).toHaveClass('max-md:hidden');
  });

  it('sets an update made between two deliveries between them', async () => {
    serve(list([delivered, failed], { updatedAt: '2026-11-26T10:30:00Z' }));
    renderDialog();

    const items = within(await chronology()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('com.kaiten.gadget.v1.created'),
      expect.stringContaining('Webhook updated'),
      expect.stringContaining('Instance created'),
      expect.stringContaining('Webhook created'),
    ]);
  });

  it('says older deliveries are not shown, without an older creation, when there are more', async () => {
    serve({ ...list([delivered, failed]), hasMore: true });
    renderDialog();

    const items = within(await chronology()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('com.kaiten.gadget.v1.created'),
      expect.stringContaining('Instance created'),
      'Older deliveries are not shown',
    ]);
    expect(screen.queryByText('Webhook created')).toBeNull();
  });

  it('keeps the delivery shown when a refetch brings in a newer one', async () => {
    serve(list([delivered]));
    const { queryClient } = renderDialog();

    const [first] = deliveryButtons(await chronology());
    expect(first).toHaveAttribute('aria-current', 'true');
    const detail = screen.getByTestId('webhook-delivery-detail');
    expect(within(detail).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Instance created',
    );

    serve(list([delivered, failed]));
    await queryClient.invalidateQueries();
    const list_ = await chronology();
    await waitFor(() => expect(deliveryButtons(list_)).toHaveLength(2));

    const [newest, shown] = deliveryButtons(list_);
    expect(shown).toHaveAttribute('aria-current', 'true');
    expect(newest).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('webhook-delivery-detail')).toBe(detail);
    expect(within(detail).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Instance created',
    );
  });

  it('moves the focus to the detail on a phone, and back to the delivery', async () => {
    const width = window.innerWidth;
    window.innerWidth = 375;
    try {
      const user = userEvent.setup();
      serve(list([delivered, failed]));
      renderDialog();

      const older = deliveryButtons(await chronology())[1];
      await user.click(older);
      expect(
        screen.getByRole('button', { name: 'Back to deliveries' }),
      ).toHaveFocus();

      await user.click(
        screen.getByRole('button', { name: 'Back to deliveries' }),
      );
      expect(older).toHaveFocus();
    } finally {
      window.innerWidth = width;
    }
  });

  it('says so when there is no delivery yet, with only the creation', async () => {
    serve(list([], { updatedAt: '2026-11-01T09:00:30Z' }));
    renderDialog();

    expect(
      await screen.findByText(
        "No deliveries yet. They appear here after one of this webhook's events is published.",
      ),
    ).toBeInTheDocument();
    const items = within(await chronology()).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Webhook created');
    expect(screen.queryByTestId('webhook-deliveries-rate')).toBeNull();
  });

  it('shows the failure to read the deliveries, with Retry', async () => {
    serve({ status: 500 });
    renderDialog();

    expect(
      await screen.findByText('Failed to load the deliveries.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
