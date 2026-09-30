import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useSuspenseQuery } from '@tanstack/react-query';
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
  sortWebhookHistoryEntries,
} from '../webhook-history-filters';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();

  return {
    ...actual,
    useSuspenseQuery: vi.fn(),
  };
});

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
        'Pages.Integrations.Webhooks.History.FailureDialog.description':
          'Failure details',
        'Pages.Integrations.Webhooks.History.FailureDialog.hookLabel':
          'Webhook:',
        'Pages.Integrations.Webhooks.History.FailureDialog.responseLabel':
          'Response:',
        'Pages.Integrations.Webhooks.History.FailureDialog.statusCodeLabel':
          'HTTP status:',
        'Pages.Integrations.Webhooks.History.FailureDialog.title':
          'Failed delivery details',
        'Pages.Integrations.Webhooks.History.Status.fail': 'Fail',
        'Pages.Integrations.Webhooks.History.Status.pending': 'Pending',
        'Pages.Integrations.Webhooks.History.Status.sending': 'Sending',
        'Pages.Integrations.Webhooks.History.Status.success': 'OK',
        'Pages.Integrations.Webhooks.History.Table.actions': 'Actions',
        'Pages.Integrations.Webhooks.History.Table.date': 'Date',
        'Pages.Integrations.Webhooks.History.Table.emptyState':
          'No deliveries match the selected filters.',
        'Pages.Integrations.Webhooks.History.Table.event': 'Event',
        'Pages.Integrations.Webhooks.History.Table.failureInfo': 'Failure info',
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

      return translations[key] ?? key;
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

const renderHistory = () => render(<WebhookHistorySection />);

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
    useSuspenseQueryMock.mockImplementation((query) => {
      if (query === webhookHistoryQueryOptions) {
        return { data: { history: historyData } } as never;
      }

      if (query === webhooksQueryOptions) {
        return { data: activeWebhooks } as never;
      }

      return { data: [] } as never;
    });
  });

  it('renders history in descending date order and opens failure details', async () => {
    const user = userEvent.setup();

    renderHistory();

    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1];
    const secondDataRow = rows[2];

    expect(
      within(firstDataRow).getByText('Customer created'),
    ).toBeInTheDocument();
    expect(
      within(secondDataRow).getByText('Instance updated'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View details' }));

    expect(
      screen.getByRole('heading', { name: 'Failed delivery details' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Internal server error')).toHaveLength(2);
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

    useSuspenseQueryMock.mockImplementation((query) => {
      if (query === webhookHistoryQueryOptions) {
        return { data: { history: [] } } as never;
      }

      if (query === webhooksQueryOptions) {
        return { data: activeWebhooks } as never;
      }

      return { data: [] } as never;
    });

    rerender(<WebhookHistorySection />);

    expect(screen.getByText('No webhook deliveries yet.')).toBeInTheDocument();
  });
});
