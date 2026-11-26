import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { server } from '@/__tests__/msw-server';
import { configureApiClient } from '@/lib/api/configure-api-client';
import {
  webhookHistoryQueryOptions,
  webhooksQueryOptions,
} from '../../../queries';
import i18n from '@/lib/i18n/config';
import { WebhookHistorySection } from '../webhook-history-section';
import {
  buildWebhookHistoryEventOptions,
  buildWebhookHistoryHookOptions,
  buildWebhookHistoryHookUrlById,
  createWebhookHistoryFilterFields,
  getWebhookHistorySearchTokens,
  sortWebhookHistoryEntries,
} from '../webhook-history-filters';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();

  return {
    ...actual,
    useSuspenseQuery: vi.fn(),
  };
});

vi.mock('@/hooks/use-granted-scopes', () => ({
  useGrantedScopes: () => ({ isPending: false, scopes: null }),
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    init: () => undefined,
    type: '3rdParty',
  },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'Common.addFilter': 'Add filter',
        'Common.advancedFilter': 'Advanced filter',
        'Common.all': 'All',
        'Common.and': 'and',
        'Common.clearFilter': 'Clear filter',
        'Common.clearRules': 'Clear rules',
        'Common.deleteRule': 'Delete rule',
        'Common.falseValue': 'False',
        'Common.filter': 'Filter',
        'Common.filterBy': 'Filter by',
        'Common.filterFieldPlaceholder': 'Filter {{field}}',
        'Common.noFilterAvailable': 'No filter available',
        'Common.noResults': 'No results',
        'Common.or': 'or',
        'Common.rulesCount': `${options?.count ?? 0} rules`,
        'Common.search': 'Search',
        'Common.trueValue': 'True',
        'Common.where': 'Where',
        'Features.AuditTrail.events.CUSTOMER_CREATED': 'Customer created',
        'Features.AuditTrail.events.INSTANCE_UPDATED': 'Instance updated',
        'Pages.Integrations.Webhooks.EventGroups.customer': 'Customers',
        'Pages.Integrations.Webhooks.EventGroups.instance': 'Instances',
        'Pages.Integrations.Webhooks.History.Filters.queryPlaceholder':
          'Search deliveries',
        'Pages.Integrations.Webhooks.Deliveries.Detail.bodyLabel':
          'Body sent, as JSON',
        'Pages.Integrations.Webhooks.Deliveries.Detail.bodyNotReported':
          'Body not reported',
        'Pages.Integrations.Webhooks.Deliveries.Detail.response':
          'Response · attempt {{index}} of {{count}}',
        'Pages.Integrations.Webhooks.Deliveries.Detail.responseBodyLabel':
          'Response body',
        'Pages.Integrations.Webhooks.Deliveries.Detail.title':
          'Delivery details',
        'Pages.Integrations.Webhooks.History.Status.fail': 'Fail',
        'Pages.Integrations.Webhooks.History.Status.pending': 'Pending',
        'Pages.Integrations.Webhooks.History.Status.sending': 'Sending',
        'Pages.Integrations.Webhooks.History.Status.success': 'OK',
        'Pages.Integrations.Webhooks.History.Table.actions': 'Actions',
        'Pages.Integrations.Webhooks.History.Table.date': 'Date',
        'Pages.Integrations.Webhooks.History.Table.emptyState':
          'No deliveries match the selected filters.',
        'Pages.Integrations.Webhooks.History.Table.event': 'Event',
        'Pages.Integrations.Webhooks.History.Table.response': 'Response',
        'Pages.Integrations.Webhooks.History.Table.hookUrl': 'Hook URL',
        'Pages.Integrations.Webhooks.History.Table.status': 'Status',
        'Pages.Integrations.Webhooks.History.Table.viewDetails': 'View details',
        'Pages.Integrations.Webhooks.History.emptyState':
          'No webhook deliveries yet.',
        'Pages.Integrations.Webhooks.History.emptyStateHint':
          'Deliveries will appear here after your event webhooks are triggered.',
        'Pages.Integrations.Webhooks.History.eventFilter': 'Event',
        'Pages.Integrations.Webhooks.History.hookFilter': 'Webhook URL',
      };

      return (translations[key] ?? key).replace(
        /\{\{(\w+)\}\}/g,
        (_, name: string) => String(options?.[name] ?? ''),
      );
    },
  }),
}));

const useSuspenseQueryMock = vi.mocked(useSuspenseQuery);

const historyData = [
  {
    date: '2026-03-03T12:00:00Z',
    eventType: 'com.kaiten.customer.v1.created',
    hookId: 'webhook-1',
    hookUrl: 'https://example.com/customer-hook',
    responseStatusCode: 500,
    responseStatusText: 'Internal server error',
    status: 'fail',
    messageId: 'msg_customer',
    attemptId: 'atmpt_customer_1',
  },
  {
    date: '2026-03-02T10:00:00Z',
    eventType: 'com.kaiten.instance.v1.updated',
    hookId: 'deleted-hook',
    hookUrl: 'https://deleted.example.com/hook',
    responseStatusCode: 200,
    responseStatusText: '',
    status: 'success',
  },
];

const activeWebhooks = [
  {
    id: 'webhook-1',
    url: 'https://example.com/customer-hook',
  },
];

const customerMessage = {
  messageId: 'msg_customer',
  eventType: 'com.kaiten.customer.v1.created',
  timestamp: '2026-03-03T11:59:59Z',
  payloadAvailable: true,
  payload: { name: 'CUSTOMER_CREATED', data: { slug: 'acme' } },
  attempts: [
    {
      id: 'atmpt_customer_2',
      timestamp: '2026-03-03T13:00:00Z',
      status: 'success',
      responseStatusCode: 200,
      triggerType: 'manual',
    },
    {
      id: 'atmpt_customer_1',
      timestamp: '2026-03-03T12:00:00Z',
      status: 'fail',
      responseStatusCode: 500,
      response: 'Internal server error',
      triggerType: 'scheduled',
    },
  ],
};

/** Serves the message detail; records the message ids read. */
function serveMessages() {
  const reads: string[] = [];
  server.use(
    http.get('*/webhooks/:webhookId/messages/:messageId', ({ params }) => {
      reads.push(String(params.messageId));
      return HttpResponse.json(customerMessage);
    }),
  );
  return reads;
}

const queryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderHistory() {
  const client = queryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <WebhookHistorySection />
    </QueryClientProvider>,
  );
  return {
    ...view,
    rerender: () =>
      view.rerender(
        <QueryClientProvider client={client}>
          <WebhookHistorySection />
        </QueryClientProvider>,
      ),
  };
}

function serveHistory(history: typeof historyData) {
  useSuspenseQueryMock.mockImplementation((query) => {
    if (query === webhookHistoryQueryOptions) {
      return { data: { history } } as never;
    }

    if (query === webhooksQueryOptions) {
      return { data: activeWebhooks } as never;
    }

    return { data: [] } as never;
  });
}

beforeAll(() => configureApiClient());

Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
  configurable: true,
  value: () => false,
});
Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
  configurable: true,
  value: () => undefined,
});

describe('WebhookHistorySection', () => {
  beforeEach(() => {
    useSuspenseQueryMock.mockReset();
    serveHistory(historyData);
  });

  it('renders history in descending date order with View details on every row', () => {
    serveMessages();
    renderHistory();

    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Customer created')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Instance updated')).toBeInTheDocument();
    expect(
      within(rows[1]).getByRole('button', { name: 'View details' }),
    ).toBeInTheDocument();
    expect(
      within(rows[2]).getByRole('button', { name: 'View details' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Response' }),
    ).toBeInTheDocument();
  });

  it('opens a failure on its attempt, with the body the message read gives', async () => {
    const reads = serveMessages();
    const user = userEvent.setup();
    renderHistory();

    await user.click(
      within(screen.getAllByRole('row')[1]).getByRole('button', {
        name: 'View details',
      }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Delivery details' });
    expect(
      await within(dialog).findByRole('region', { name: 'Body sent, as JSON' }),
    ).toHaveTextContent('"slug": "acme"');
    expect(
      within(dialog).getByText('Response · attempt 1 of 2'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('region', { name: 'Response body' }),
    ).toHaveTextContent('Internal server error');
    expect(reads).toEqual(['msg_customer']);
  });

  it('opens a success of an older saas-api without reading a message', async () => {
    const reads = serveMessages();
    const user = userEvent.setup();
    renderHistory();

    await user.click(
      within(screen.getAllByRole('row')[2]).getByRole('button', {
        name: 'View details',
      }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Delivery details' });
    expect(within(dialog).getByText('Body not reported')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Response · attempt 1 of 1'),
    ).toBeInTheDocument();
    expect(reads).toEqual([]);
  });

  it('keeps the search and the open detail across a history refetch', async () => {
    serveMessages();
    const user = userEvent.setup();
    const view = renderHistory();

    fireEvent.change(screen.getByPlaceholderText('Search deliveries'), {
      target: { value: 'msg_customer' },
    });
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'View details' }));

    // A refetch whose window no longer holds the open delivery.
    serveHistory([{ ...historyData[1] }]);
    view.rerender();

    expect(screen.getByPlaceholderText('Search deliveries')).toHaveValue(
      'msg_customer',
    );
    expect(
      screen.getByRole('dialog', { name: 'Delivery details' }),
    ).toBeInTheDocument();
  });

  it('finds an attempt by its message and attempt ids', () => {
    const tokens = getWebhookHistorySearchTokens(
      historyData[0] as never,
      new Map(),
      ((key: string) => key) as never,
    );

    expect(tokens).toContain('msg_customer');
    expect(tokens).toContain('atmpt_customer_1');
  });

  it('builds quick filter options with history-only hooks and resolved event labels', () => {
    const sortedHistory = sortWebhookHistoryEntries(historyData as any);
    const hookUrlById = buildWebhookHistoryHookUrlById(
      sortedHistory,
      activeWebhooks,
    );

    expect(buildWebhookHistoryHookOptions(hookUrlById)).toContainEqual({
      label: 'https://deleted.example.com/hook',
      value: 'deleted-hook',
    });
    expect(
      buildWebhookHistoryEventOptions(sortedHistory, i18n.t.bind(i18n)),
    ).toContainEqual({
      label: 'Customers – Customer created',
      value: 'com.kaiten.customer.v1.created',
    });
    expect(
      buildWebhookHistoryEventOptions(
        [{ ...historyData[0], eventType: 'com.kaiten.gadget.v1.created' }] as any,
        i18n.t.bind(i18n),
      ),
    ).toEqual([
      {
        label: 'com.kaiten.gadget.v1.created',
        value: 'com.kaiten.gadget.v1.created',
      },
    ]);
  });

  it('marks event and hook filters as searchable quick-access and status/date as advanced-only', () => {
    const filterFields = createWebhookHistoryFilterFields({
      eventOptions: buildWebhookHistoryEventOptions(
        historyData as any,
        i18n.t.bind(i18n),
      ),
      hookOptions: buildWebhookHistoryHookOptions(
        buildWebhookHistoryHookUrlById(
          sortWebhookHistoryEntries(historyData as any),
          activeWebhooks,
        ),
      ),
      hookUrlById: new Map([
        ['deleted-hook', 'https://deleted.example.com/hook'],
      ]),
      statusOptions: [{ label: 'Fail', value: 'fail' }],
      t: ((key: string) => key) as any,
    });

    expect(
      filterFields.find((field) => field.id === 'eventType')?.quickAccess,
    ).toBe(true);
    expect(
      filterFields.find((field) => field.id === 'hookId')?.quickAccess,
    ).toBe(true);
    expect(
      filterFields.find((field) => field.id === 'eventType')?.searchable,
    ).toBe(true);
    expect(
      filterFields.find((field) => field.id === 'hookId')?.searchable,
    ).toBe(true);
    expect(
      filterFields.find((field) => field.id === 'status')?.normalFilterable,
    ).toBe(false);
    expect(
      filterFields.find((field) => field.id === 'date')?.normalFilterable,
    ).toBe(false);
  });

  it('shows distinct empty states for no history and no filtered results', async () => {
    const { rerender } = renderHistory();

    fireEvent.change(screen.getByPlaceholderText('Search deliveries'), {
      target: { value: 'not-found' },
    });

    await waitFor(() => {
      expect(
        screen.getByText('No deliveries match the selected filters.'),
      ).toBeInTheDocument();
    });

    serveHistory([]);

    rerender();

    expect(screen.getByText('No webhook deliveries yet.')).toBeInTheDocument();
  });
});
