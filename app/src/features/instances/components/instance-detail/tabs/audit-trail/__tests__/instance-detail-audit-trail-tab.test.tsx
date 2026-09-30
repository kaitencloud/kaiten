import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useSuspenseQuery } from '@tanstack/react-query';
import { InstanceDetailAuditTrailTab } from '../instance-detail-audit-trail-tab';

const {
  auditTrailChartsSectionMock,
  auditTrailStatsCardsMock,
  useInstanceDetailMock,
} = vi.hoisted(() => ({
  auditTrailChartsSectionMock: vi.fn(),
  auditTrailStatsCardsMock: vi.fn(),
  useInstanceDetailMock: vi.fn(),
}));

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
    i18n: {
      resolvedLanguage: 'en-US',
    },
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'Common.tableShowingRecords') {
        return `Showing ${options?.start}-${options?.end} of ${options?.total} records`;
      }

      if (
        key ===
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.resultsCount'
      ) {
        const count = options?.count ?? 0;
        return `${count} result${count === 1 ? '' : 's'}`;
      }

      const translations: Record<string, string> = {
        'Common.firstPage': 'First page',
        'Common.lastPage': 'Last page',
        'Common.next': 'Next',
        'Common.noResults': 'No results',
        'Common.previous': 'Previous',
        'Common.rowsPerPage': 'Rows per page',
        'Pages.Customers.Instances.Detail.auditTrail.table.title': 'Event Log',
        'Pages.Customers.Instances.Detail.auditTrail.table.description':
          'Immutable record of all entitlement operations on this instance',
        'Pages.Customers.Instances.Detail.auditTrail.table.autoRefresh':
          'Auto-refreshes',
        'Pages.Customers.Instances.Detail.auditTrail.table.searchPlaceholder':
          'Search by entitlement, event...',
        'Pages.Customers.Instances.Detail.auditTrail.table.empty':
          'No audit trail entries found',
        'Pages.Customers.Instances.Detail.auditTrail.table.headers.id': '#',
        'Pages.Customers.Instances.Detail.auditTrail.table.headers.event':
          'Event',
        'Pages.Customers.Instances.Detail.auditTrail.table.headers.entitlement':
          'Entitlement',
        'Pages.Customers.Instances.Detail.auditTrail.table.headers.status':
          'Status',
        'Pages.Customers.Instances.Detail.auditTrail.table.headers.timestamp':
          'Timestamp',
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.allEvents':
          'All events',
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.allGroups':
          'All groups',
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.allStatuses':
          'All statuses',
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.accepted':
          'Accepted',
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.clear':
          'Clear filters',
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.eventFilterLabel':
          'Filter by event',
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.groupFilterLabel':
          'Filter by group',
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.read':
          'Read',
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.rejected':
          'Rejected',
        'Pages.Customers.Instances.Detail.auditTrail.table.filters.statusFilterLabel':
          'Filter by status',
        'Pages.Customers.Instances.Detail.auditTrail.table.actions.viewDetails':
          'View details',
        'Features.AuditTrail.events.ENTITLEMENT_VALUE_GET': 'Entitlement Read',
        'Features.AuditTrail.events.ENTITLEMENT_USAGE_REPORT_ACCEPTED':
          'Usage Reported',
        'Features.AuditTrail.events.ENTITLEMENT_USAGE_REPORT_REJECTED':
          'Usage Rejected',
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('../../../instance-detail-context', () => ({
  useInstanceDetail: useInstanceDetailMock,
}));

vi.mock('../audit-trail-stats-cards', () => ({
  AuditTrailStatsCards: (props: Record<string, unknown>) => {
    auditTrailStatsCardsMock(props);
    return <div>stats cards</div>;
  },
}));

vi.mock('../audit-trail-charts-section', () => ({
  AuditTrailChartsSection: (props: Record<string, unknown>) => {
    auditTrailChartsSectionMock(props);
    return <div>charts section</div>;
  },
}));

vi.mock('../audit-trail-how-it-works', () => ({
  AuditTrailHowItWorks: () => <div>how it works</div>,
}));

vi.mock('../audit-trail-detail-dialog', () => ({
  AuditDetailDialog: () => <button type="button">View details</button>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <select
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

const useSuspenseQueryMock = vi.mocked(useSuspenseQuery);

const auditTrailEntries = [
  {
    eventName: 'ENTITLEMENT_VALUE_GET',
    eventType: 'com.kaiten.instance.entitlement.v1.value_get',
    id: '1',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'api-calls',
      type: 'NUMBER',
      value: 12,
    },
    timestamp: '2026-03-25T10:58:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
    id: '2',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'api-calls',
      type: 'NUMBER',
      value: 15,
    },
    timestamp: '2026-03-25T10:30:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_USAGE_REPORT_REJECTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_rejected',
    id: '3',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'webhooks',
      type: 'NUMBER',
      value: 7,
    },
    timestamp: '2026-03-25T10:15:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_VALUE_GET',
    eventType: 'com.kaiten.instance.entitlement.v1.value_get',
    id: '4',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'storage-gb',
      type: 'NUMBER',
      value: 40,
    },
    timestamp: '2026-03-25T09:00:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
    id: '5',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'webhooks',
      type: 'NUMBER',
      value: 5,
    },
    timestamp: '2026-03-25T08:00:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_VALUE_GET',
    eventType: 'com.kaiten.instance.entitlement.v1.value_get',
    id: '6',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'active-users',
      type: 'NUMBER',
      value: 100,
    },
    timestamp: '2026-03-25T07:00:00.000Z',
  },
];

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

describe('InstanceDetailAuditTrailTab', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T11:00:00.000Z'));
    auditTrailChartsSectionMock.mockReset();
    auditTrailStatsCardsMock.mockReset();
    useSuspenseQueryMock.mockReset();
    useSuspenseQueryMock.mockReturnValue({
      data: { hasMore: false, items: auditTrailEntries, nextCursor: null },
    } as never);
    useInstanceDetailMock.mockReturnValue({
      entitlementsRows: [
        {
          enabled: true,
          entitlementId: 'ent-api',
          entitlementGroups: [
            { id: 'group-usage', name: 'Usage', slug: 'usage' },
          ],
          entitlementName: 'API Calls',
          entitlementSlug: 'api-calls',
          entitlementType: 'NUMBER',
          threshold: 100,
          value: 0,
        },
        {
          enabled: true,
          entitlementGroups: [
            { id: 'group-billing', name: 'Billing', slug: 'billing' },
          ],
          entitlementId: 'ent-storage',
          entitlementName: 'Storage',
          entitlementSlug: 'storage-gb',
          entitlementType: 'NUMBER',
          threshold: 200,
          value: 0,
        },
      ],
      instance: {
        slug: 'acme-prod',
      },
    });
  });

  it('requests audit trail polling and paginates the event log by 5 rows', () => {
    render(<InstanceDetailAuditTrailTab />);

    expect(screen.getByText('Auto-refreshes')).toBeInTheDocument();
    expect(screen.getByText('Showing 1-5 of 6 records')).toBeInTheDocument();

    const query = useSuspenseQueryMock.mock.calls[0]?.[0] as {
      queryKey?: Array<{ query?: { limit?: number } }>;
      refetchInterval?: number;
    };

    expect(query?.refetchInterval).toBe(30_000);
    expect(query?.queryKey?.[0]?.query?.limit).toBe(200);
  });

  it('combines search, event, and status filters and resets them', async () => {
    render(<InstanceDetailAuditTrailTab />);

    fireEvent.change(
      screen.getByPlaceholderText('Search by entitlement, event...'),
      {
        target: { value: 'storage' },
      },
    );

    const [groupFilter, eventFilter, statusFilter] =
      screen.getAllByRole('combobox');

    fireEvent.change(groupFilter, {
      target: { value: 'billing' },
    });

    fireEvent.change(eventFilter, {
      target: { value: 'ENTITLEMENT_VALUE_GET' },
    });
    fireEvent.change(statusFilter, {
      target: { value: 'read' },
    });

    expect(screen.getByText('1 result')).toBeInTheDocument();
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();

    const filteredRow = screen.getByText('#4').closest('tr');

    expect(filteredRow).not.toHaveClass('bg-destructive/5');

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(
      screen.getByPlaceholderText('Search by entitlement, event...'),
    ).toHaveValue('');
    expect(groupFilter).toHaveValue('all');
    expect(screen.queryByText('1 result')).not.toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    const tableRows = rows.filter((row) => within(row).queryByText(/^#\d+/));

    expect(tableRows).toHaveLength(5);
  });

  it('adds a group filter to the event log while keeping charts and stats unfiltered', () => {
    render(<InstanceDetailAuditTrailTab />);

    const [groupFilter] = screen.getAllByRole('combobox');

    // Group, entitlement and status filters, plus the table's page size.
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    expect(groupFilter).toHaveValue('all');

    fireEvent.change(groupFilter, {
      target: { value: 'billing' },
    });

    expect(screen.getByText('1 result')).toBeInTheDocument();
    expect(screen.queryByText('#4')).toBeInTheDocument();
    expect(screen.queryByText('#1')).not.toBeInTheDocument();
    expect(screen.queryByText('#3')).not.toBeInTheDocument();

    expect(auditTrailStatsCardsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: expect.arrayContaining(auditTrailEntries),
      }),
    );
    expect(auditTrailChartsSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: expect.arrayContaining(auditTrailEntries),
        entitlementsRows: expect.arrayContaining([
          expect.objectContaining({ entitlementSlug: 'api-calls' }),
          expect.objectContaining({ entitlementSlug: 'storage-gb' }),
        ]),
      }),
    );
  });
});
