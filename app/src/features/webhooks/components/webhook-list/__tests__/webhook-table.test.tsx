import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Webhook } from '../../../types';
import { WebhookTable } from '../webhook-table';

const {
  clipboardWriteTextMock,
  getWebhookMessagesMock,
  getWebhookMock,
  toastErrorMock,
  toastSuccessMock,
  useEllipsisMock,
} = vi.hoisted(() => ({
  clipboardWriteTextMock: vi.fn(),
  getWebhookMessagesMock: vi.fn(),
  getWebhookMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  useEllipsisMock: vi.fn(),
}));

vi.mock('@/hooks/use-ellipsis', () => ({
  useEllipsis: useEllipsisMock,
}));

vi.mock('../../../webhooks.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../webhooks.api')>();

  return {
    ...actual,
    getWebhook: getWebhookMock,
    getWebhookMessages: getWebhookMessagesMock,
  };
});

// The Edit action is a router link: rendered as a plain anchor, with the
// params put into the path, so the test needs no router.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    preload: _preload,
    to,
    ...props
  }: {
    children: ReactNode;
    params?: Record<string, string>;
    preload?: unknown;
    to: string;
  }) => (
    <a
      {...props}
      href={to.replace('$webhookId', params?.webhookId ?? '$webhookId')}
    >
      {children}
    </a>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

// One `t` for every render, as react-i18next's own: the columns depend on it,
// and a new `t` per render would rebuild them and remount every cell.
vi.mock('react-i18next', () => {
  const t = (key: string, options?: unknown) => {
      if (typeof options === 'string') {
        return options;
      }

      const translations: Record<string, string> = {
        'Common.actions': 'Actions',
        'Common.cancel': 'Cancel',
        'Common.confirm': 'Confirm',
        'Common.confirmDeleteDescription': 'Delete {{name}}?',
        'Common.confirmDeleteTitle': 'Delete',
        'Common.delete': 'Delete',
        'Common.firstPage': 'First page',
        'Common.lastPage': 'Last page',
        'Common.next': 'Next',
        'Common.noResults': 'No results',
        'Common.previous': 'Previous',
        'Common.rowsPerPage': 'Rows per page',
        'Pages.Integrations.Webhooks.EventGroups.customer': 'Customers',
        'Pages.Integrations.Webhooks.EventGroups.instance': 'Instances',
        'Pages.Integrations.Webhooks.EventGroups.other': 'Other events',
        'Pages.Integrations.Webhooks.Deliveries.cell.allDelivered':
          'all delivered',
        'Pages.Integrations.Webhooks.Deliveries.cell.ariaLabel':
          'Deliveries of {{host}}: {{summary}}. Open details.',
        'Pages.Integrations.Webhooks.Deliveries.cell.none': 'No deliveries yet',
        'Pages.Integrations.Webhooks.Deliveries.cell.summary':
          '{{when}} · {{outcome}}',
        'Pages.Integrations.Webhooks.Table.created': 'Created',
        'Pages.Integrations.Webhooks.Table.deliveries': 'Deliveries',
        'Pages.Integrations.Webhooks.Table.edit': 'Edit webhook {{host}}',
        'Pages.Integrations.Webhooks.Table.events': 'Events',
        'Pages.Integrations.Webhooks.Table.signingSecret': 'Signing secret',
        'Pages.Integrations.Webhooks.Table.showSigningSecret':
          'Show signing secret',
        'Pages.Integrations.Webhooks.Table.hideSigningSecret':
          'Hide signing secret',
        'Pages.Integrations.Webhooks.Table.copySigningSecret':
          'Copy signing secret',
        'Pages.Integrations.Webhooks.Table.signingSecretCopied':
          'Signing secret copied',
        'Pages.Integrations.Webhooks.Table.signingSecretLoadError':
          'Failed to load signing secret',
        'Pages.Integrations.Webhooks.Table.signingSecretCopyError':
          'Failed to copy signing secret',
        'Pages.Integrations.Webhooks.Table.url': 'URL',
      };

      const text = translations[key] ?? key;

      return typeof options === 'object' && options !== null
        ? Object.entries(options).reduce(
            (result, [name, value]) =>
              result.replace(`{{${name}}}`, String(value)),
            text,
          )
        : text;
  };

  return {
    initReactI18next: {
      init: () => undefined,
      type: '3rdParty',
    },
    useTranslation: () => ({ t }),
  };
});

const webhooks: Webhook[] = [
  {
    createdAt: '2026-02-25',
    eventTypes: ['com.kaiten.customer.v1.created'],
    id: 'webhook-1',
    url: 'https://example.com/hook',
  },
];

/** A list of messages, as `GET /webhooks/{id}/messages` answers it. */
function messageList(webhookId: string, messageIds: string[]) {
  return {
    webhook: {
      id: webhookId,
      url: 'https://example.com/hook',
      createdAt: '2026-02-25T00:00:00Z',
      updatedAt: '2026-02-25T00:00:00Z',
    },
    messages: messageIds.map((messageId, index) => ({
      messageId,
      eventType: 'com.kaiten.customer.v1.created',
      timestamp: new Date(Date.UTC(2026, 1, 25, 10, index)).toISOString(),
      status: 'success',
    })),
    summary: {
      total: messageIds.length,
      delivered: messageIds.length,
      failed: 0,
      pending: 0,
    },
    hasMore: false,
  };
}

function renderWebhookTable(
  props: Omit<ComponentProps<typeof WebhookTable>, 'onOpenDeliveries'> &
    Partial<Pick<ComponentProps<typeof WebhookTable>, 'onOpenDeliveries'>>,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <WebhookTable onOpenDeliveries={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('WebhookTable', () => {
  beforeEach(() => {
    clipboardWriteTextMock.mockReset();
    clipboardWriteTextMock.mockResolvedValue(undefined);
    getWebhookMock.mockReset();
    getWebhookMessagesMock.mockReset();
    getWebhookMessagesMock.mockImplementation((webhookId: string) =>
      Promise.resolve(messageList(webhookId, [])),
    );
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    useEllipsisMock.mockReset();
    useEllipsisMock.mockReturnValue({
      className: 'whitespace-nowrap overflow-hidden text-ellipsis',
      isEllipsis: false,
      ref: { current: null },
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    });
  });

  it('renders expected columns and compact event identifiers', () => {
    renderWebhookTable({ webhooks, onDelete: vi.fn() });

    expect(
      screen.getByRole('columnheader', { name: 'Events' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'URL' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Deliveries' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Signing secret' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Created' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Actions' }),
    ).toBeInTheDocument();

    expect(screen.getByText('CUSTOMER_CREATED')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/hook')).toBeInTheDocument();
  });

  it('shows a grouped tooltip when the event summary is truncated', async () => {
    const user = userEvent.setup();

    useEllipsisMock.mockReturnValue({
      className: 'whitespace-nowrap overflow-hidden text-ellipsis',
      isEllipsis: true,
      ref: { current: null },
    });

    renderWebhookTable({
      webhooks: [
        {
          createdAt: '2026-02-25',
          eventTypes: [
            'com.kaiten.customer.v1.created',
            'com.kaiten.customer.v1.updated',
            'com.kaiten.instance.v1.updated',
            'com.kaiten.gadget.v1.created',
          ],
          id: 'webhook-2',
          url: 'https://example.com/truncated-hook',
        },
      ],
      onDelete: vi.fn(),
    });

    await user.hover(
      screen.getByRole('button', {
        name: /CUSTOMER_CREATED, CUSTOMER_UPDATED, INSTANCE_UPDATED/,
      }),
    );

    const tooltip = await screen.findByRole('tooltip');

    expect(within(tooltip).getByText('Customers')).toBeInTheDocument();
    expect(within(tooltip).getByText('Instances')).toBeInTheDocument();
    expect(within(tooltip).getByText('CUSTOMER_CREATED')).toBeInTheDocument();
    expect(within(tooltip).getByText('CUSTOMER_UPDATED')).toBeInTheDocument();
    expect(within(tooltip).getByText('INSTANCE_UPDATED')).toBeInTheDocument();
    // A type newer than this build closes the list, as itself.
    expect(within(tooltip).getByText('Other events')).toBeInTheDocument();
    expect(
      within(tooltip).getByText('com.kaiten.gadget.v1.created'),
    ).toBeInTheDocument();
  });

  it('loads, caches, and copies the signing secret on demand', async () => {
    const user = userEvent.setup();
    const clipboardWriteSpy = vi.spyOn(navigator.clipboard, 'writeText');
    clipboardWriteSpy.mockResolvedValue(undefined);

    getWebhookMock.mockResolvedValue({
      createdAt: '2026-02-25',
      eventTypes: ['com.kaiten.customer.v1.created'],
      id: 'webhook-1',
      signingSecret: 'whsec_test_secret',
      url: 'https://example.com/hook',
    });

    renderWebhookTable({ webhooks, onDelete: vi.fn() });

    expect(getWebhookMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Show signing secret' }),
    );

    await screen.findByText('whsec_test_secret');

    expect(getWebhookMock).toHaveBeenCalledTimes(1);
    expect(getWebhookMock).toHaveBeenCalledWith('webhook-1');

    await user.click(
      screen.getByRole('button', { name: 'Hide signing secret' }),
    );

    expect(screen.queryByText('whsec_test_secret')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Show signing secret' }),
    );

    await screen.findByText('whsec_test_secret');
    expect(getWebhookMock).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: 'Copy signing secret' }),
    );

    await waitFor(() => {
      expect(clipboardWriteSpy).toHaveBeenCalledWith('whsec_test_secret');
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Signing secret copied');
  });

  it('links each row to the edit page of its webhook, named by its host', () => {
    renderWebhookTable({
      webhooks: [
        {
          createdAt: '2026-02-25',
          eventTypes: ['com.kaiten.customer.v1.created'],
          id: 'webhook-1',
          url: 'https://hooks.slack.com/services/T000/B000/secret-path',
        },
      ],
      onDelete: vi.fn(),
    });

    const edit = screen.getByRole('link', {
      name: 'Edit webhook hooks.slack.com',
    });

    expect(edit).toHaveAttribute(
      'href',
      '/integrations/webhooks/webhook-1/edit',
    );
    // The label never repeats the URL: its path is a credential.
    expect(edit.getAttribute('aria-label')).not.toContain('secret-path');
  });

  it('calls onDelete when clicking delete action', () => {
    const onDelete = vi.fn();

    renderWebhookTable({ webhooks, onDelete });

    const row = screen.getByText('https://example.com/hook').closest('tr');

    if (!row) {
      throw new Error('Expected webhook row was not rendered');
    }

    const deleteButton = within(row).getByRole('button', { name: 'Delete' });

    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onDelete).toHaveBeenCalledWith('webhook-1');
  });
  it('reads the recent deliveries of each row and opens them from its cell', async () => {
    const user = userEvent.setup();
    const onOpenDeliveries = vi.fn();
    getWebhookMessagesMock.mockImplementation((webhookId: string) =>
      Promise.resolve(messageList(webhookId, ['msg_1', 'msg_2'])),
    );

    renderWebhookTable({ webhooks, onDelete: vi.fn(), onOpenDeliveries });

    const open = await screen.findByRole('button', {
      name: /^Deliveries of example\.com: .* · all delivered\. Open details\.$/,
    });
    expect(getWebhookMessagesMock).toHaveBeenCalledWith('webhook-1', {
      limit: 20,
      withAttempts: false,
    });

    await user.click(open);

    expect(onOpenDeliveries).toHaveBeenCalledWith('webhook-1');
  });

  it('keeps the state of a row with its webhook when the rows are reordered', async () => {
    const user = userEvent.setup();
    const first: Webhook = {
      createdAt: '2026-02-25',
      eventTypes: ['com.kaiten.customer.v1.created'],
      id: 'webhook-1',
      url: 'https://example.com/first',
    };
    const second: Webhook = {
      createdAt: '2026-02-24',
      eventTypes: ['com.kaiten.customer.v1.updated'],
      id: 'webhook-2',
      url: 'https://example.com/second',
    };
    getWebhookMock.mockResolvedValue({ ...first, signingSecret: 'whsec_first' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onDelete = vi.fn();
    const onOpenDeliveries = vi.fn();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <WebhookTable
          onDelete={onDelete}
          onOpenDeliveries={onOpenDeliveries}
          webhooks={[first, second]}
        />
      </QueryClientProvider>,
    );

    const firstRow = () =>
      screen.getByText('https://example.com/first').closest('tr');
    await user.click(
      within(firstRow() as HTMLElement).getByRole('button', {
        name: 'Show signing secret',
      }),
    );
    await screen.findByText('whsec_first');

    rerender(
      <QueryClientProvider client={queryClient}>
        <WebhookTable
          onDelete={onDelete}
          onOpenDeliveries={onOpenDeliveries}
          webhooks={[second, first]}
        />
      </QueryClientProvider>,
    );

    expect(
      within(firstRow() as HTMLElement).getByText('whsec_first'),
    ).toBeInTheDocument();
  });
});
