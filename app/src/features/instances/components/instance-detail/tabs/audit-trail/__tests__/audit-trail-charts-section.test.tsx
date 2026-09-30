import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createContext, type ReactNode, use } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { AuditTrail } from '@/api-client/types.gen';
import { AuditTrailChartsSection } from '../audit-trail-charts-section';

const {
  activityTimelineChartSpy,
  buildActivityTimelineGroupChartConfigSpy,
  buildActivityTimelineStatusChartConfigSpy,
  buildValueOverTimeGroupChartConfigSpy,
  valueOverTimeChartSpy,
} = vi.hoisted(() => ({
  activityTimelineChartSpy: vi.fn(),
  buildActivityTimelineGroupChartConfigSpy: vi.fn(
    (groups: Array<{ label: string; value: string }>) =>
      Object.fromEntries(
        groups.map((group, index) => [
          group.value,
          {
            color: `var(--chart-${(index % 5) + 1})`,
            label: group.label,
          },
        ]),
      ),
  ),
  buildActivityTimelineStatusChartConfigSpy: vi.fn(() => ({
    accepted: { color: 'var(--success)', label: 'Accepted' },
    read: { color: 'var(--primary)', label: 'Read' },
    rejected: { color: 'var(--destructive)', label: 'Rejected' },
    warning: { color: 'var(--warning)', label: 'Warning' },
  })),
  buildValueOverTimeGroupChartConfigSpy: vi.fn(
    ({
      entitlements,
    }: {
      entitlements: Array<{ label: string; slug: string }>;
    }) => ({
      groupTotal: { color: 'var(--primary)', label: 'Group total' },
      ...Object.fromEntries(
        entitlements.map((entitlement, index) => [
          entitlement.slug,
          {
            color: `var(--chart-${(index % 5) + 1})`,
            label: entitlement.label,
          },
        ]),
      ),
    }),
  ),
  valueOverTimeChartSpy: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      resolvedLanguage: 'en-US',
    },
    t: (key: string, options?: Record<string, unknown>) => {
      if (
        key ===
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.visibleGroupsCount'
      ) {
        return `${options?.count} groups visible`;
      }

      if (
        key ===
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.numericEntitlementsCount'
      ) {
        return `${options?.count} numeric entitlements`;
      }

      if (
        key ===
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.visibleEntitlementsCount'
      ) {
        return `${options?.count} entitlements visible`;
      }

      if (
        key ===
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.visibleEntitlementLinesCount'
      ) {
        return `${options?.count} entitlement lines shown`;
      }

      const translations: Record<string, string> = {
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.title':
          'Activity Timeline',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.description':
          'Entitlement access events over the last period',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.allEntitlements':
          'All entitlements',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.allGroups':
          'All groups',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.entitlementFilterLabel':
          'Filter timeline by entitlement',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.groupFilterLabel':
          'Filter timeline by group',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.modeLabel':
          'Change activity timeline mode',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.modes.status':
          'By status',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.modes.group':
          'By group',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.showLabel':
          'Show:',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.visibleGroupsLabel':
          'Visible groups',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.visibleGroupsPlaceholder':
          'Visible groups',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.visibleGroupsSearchPlaceholder':
          'Search groups',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.visibleGroupsEmpty':
          'No matching groups',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.series.read':
          'Read',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.series.accepted':
          'Accepted',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.series.rejected':
          'Rejected',
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.series.warning':
          'Warning',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.title':
          'Value Over Time',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.description':
          'Track how a numeric entitlement value evolves across audit trail events',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.currentLabel':
          'Current:',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.currentTotalLabel':
          'Current total:',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.groupBadge':
          'Group',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.groupFilterLabel':
          'Select a numeric group',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.groupTotalLabel':
          'Group total',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.entitlementFilterLabel':
          'Select a numeric entitlement',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.modeLabel':
          'Change value-over-time mode',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.modes.entitlement':
          'By entitlement',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.modes.group':
          'By group',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.visibleEntitlementsLabel':
          'Visible entitlements',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.visibleEntitlementsSearchPlaceholder':
          'Search entitlements',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.visibleEntitlementsEmpty':
          'No matching entitlements',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.selectAll':
          'Select all',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.clearIndividualLines':
          'Clear individual lines',
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.allEntitlements':
          'All entitlements',
        'Pages.Entitlements.EntitlementTypes.NUMBER': 'Number',
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('../audit-trail-charts', () => ({
  ActivityTimelineChart: (props: Record<string, unknown>) => {
    activityTimelineChartSpy(props);

    return (
      <div
        data-testid="activity-timeline-chart"
        data-mode={String(props.mode)}
        data-series={(props.seriesKeys as string[]).join(',')}
      />
    );
  },
  ValueOverTimeChart: (props: Record<string, unknown>) => {
    valueOverTimeChartSpy(props);

    return (
      <div
        data-testid="value-over-time-chart"
        data-mode={String(props.mode)}
        data-series={((props.seriesKeys as string[]) ?? []).join(',')}
        data-show-legend={String(props.showLegend)}
      />
    );
  },
  buildActivityTimelineGroupChartConfig:
    buildActivityTimelineGroupChartConfigSpy,
  buildActivityTimelineStatusChartConfig:
    buildActivityTimelineStatusChartConfigSpy,
  buildValueOverTimeGroupChartConfig: buildValueOverTimeGroupChartConfigSpy,
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

vi.mock('@/components/ui/toggle-group', () => {
  const ToggleGroupContext = createContext<{
    onValueChange?: (value: string) => void;
    value?: string;
  }>({});

  return {
    ToggleGroup: ({
      children,
      onValueChange,
      value,
    }: {
      children: ReactNode;
      onValueChange?: (value: string) => void;
      value?: string;
    }) => (
      <ToggleGroupContext.Provider value={{ onValueChange, value }}>
        <div>{children}</div>
      </ToggleGroupContext.Provider>
    ),
    ToggleGroupItem: ({
      children,
      value,
    }: {
      children: ReactNode;
      value: string;
    }) => {
      const context = use(ToggleGroupContext);

      return (
        <button
          type="button"
          aria-pressed={context.value === value}
          onClick={() => context.onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },
  };
});

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: ({
    onValueChange,
    placeholder,
    value,
  }: {
    onValueChange: (value: string) => void;
    placeholder: string;
    value: string;
  }) => (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const entitlementsRows = [
  {
    enabled: true,
    entitlementGroups: [
      { id: 'group-usage', name: 'Usage', slug: 'usage' },
      { id: 'group-billing', name: 'Billing', slug: 'billing' },
    ],
    entitlementId: 'ent-api',
    entitlementName: 'API Calls',
    entitlementSlug: 'api-calls',
    entitlementType: 'NUMBER' as const,
    threshold: 100,
    limitCapExceededOveragePercent: 0,
    value: 18,
  },
  {
    enabled: true,
    entitlementGroups: [
      { id: 'group-billing', name: 'Billing', slug: 'billing' },
    ],
    entitlementId: 'ent-storage',
    entitlementName: 'Storage',
    entitlementSlug: 'storage-gb',
    entitlementType: 'NUMBER' as const,
    threshold: 200,
    limitCapExceededOveragePercent: 0,
    value: 64,
  },
  {
    enabled: true,
    entitlementGroups: [
      { id: 'group-security', name: 'Security', slug: 'security' },
    ],
    entitlementId: 'ent-sso',
    entitlementName: 'SSO',
    entitlementSlug: 'sso',
    entitlementType: 'BOOLEAN' as const,
    threshold: null,
    limitCapExceededOveragePercent: null,
    value: 0,
  },
];

const entries: AuditTrail[] = [
  {
    eventName: 'ENTITLEMENT_VALUE_GET',
    eventType: 'com.kaiten.instance.entitlement.v1.value_get',
    id: '1',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'api-calls',
      type: 'NUMBER',
      value: 10,
    },
    timestamp: '2026-03-24T10:00:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
    id: '2',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'storage-gb',
      type: 'NUMBER',
      value: 12,
    },
    timestamp: '2026-03-24T11:00:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_USAGE_REPORT_REJECTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_rejected',
    id: '3',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'sso',
      type: 'BOOLEAN',
      value: true,
    },
    timestamp: '2026-03-25T09:00:00.000Z',
  },
];

describe('AuditTrailChartsSection', () => {
  it('switches between status mode and group mode', async () => {
    render(
      <AuditTrailChartsSection
        entitlementsRows={entitlementsRows}
        entries={entries}
        locale="en-US"
      />,
    );

    expect(screen.getByTestId('activity-timeline-chart')).toHaveAttribute(
      'data-mode',
      'status',
    );
    expect(screen.queryByText('Show:')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'By group' })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId('activity-timeline-chart')).toHaveAttribute(
        'data-mode',
        'group',
      );
    });

    expect(
      screen.getByRole('button', { name: 'Visible groups' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Accepted' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Rejected' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Warning' })).toBeInTheDocument();
  });

  it('filters entitlement options by group and resets an invalid entitlement selection', async () => {
    render(
      <AuditTrailChartsSection
        entitlementsRows={entitlementsRows}
        entries={entries}
        locale="en-US"
      />,
    );

    const initialSelects = screen.getAllByRole('combobox');
    const groupSelect = initialSelects[0] as HTMLSelectElement;
    const entitlementSelect = initialSelects[1] as HTMLSelectElement;

    fireEvent.change(entitlementSelect, {
      target: { value: 'storage-gb' },
    });

    fireEvent.change(groupSelect, {
      target: { value: 'usage' },
    });

    await waitFor(() => {
      expect(
        (screen.getAllByRole('combobox')[1] as HTMLSelectElement).value,
      ).toBe('all');
    });

    const updatedEntitlementSelect = screen.getAllByRole(
      'combobox',
    )[1] as HTMLSelectElement;

    expect(
      within(updatedEntitlementSelect).getByRole('option', {
        name: 'API Calls',
      }),
    ).toBeInTheDocument();
    expect(
      within(updatedEntitlementSelect).queryByRole('option', {
        name: 'Storage',
      }),
    ).not.toBeInTheDocument();
  });

  it('updates visible group series in group mode', async () => {
    render(
      <AuditTrailChartsSection
        entitlementsRows={entitlementsRows}
        entries={entries}
        locale="en-US"
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'By group' })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId('activity-timeline-chart')).toHaveAttribute(
        'data-series',
        'billing,security,usage',
      );
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Security' })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId('activity-timeline-chart')).toHaveAttribute(
        'data-series',
        'billing,usage',
      );
    });
  });

  it('switches value over time to group mode and resets visible entitlement lines when the group changes', async () => {
    render(
      <AuditTrailChartsSection
        entitlementsRows={entitlementsRows}
        entries={entries}
        locale="en-US"
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'By group' })[1]!);

    await waitFor(() => {
      expect(screen.getByTestId('value-over-time-chart')).toHaveAttribute(
        'data-mode',
        'group',
      );
      expect(screen.getByTestId('value-over-time-chart')).toHaveAttribute(
        'data-series',
        'api-calls,storage-gb',
      );
    });

    fireEvent.change(screen.getAllByRole('combobox')[2] as HTMLSelectElement, {
      target: { value: 'usage' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('value-over-time-chart')).toHaveAttribute(
        'data-series',
        '',
      );
    });

    expect(
      screen.queryByRole('button', { name: 'Visible entitlements' }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getAllByRole('combobox')[2] as HTMLSelectElement, {
      target: { value: 'billing' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('value-over-time-chart')).toHaveAttribute(
        'data-series',
        'api-calls,storage-gb',
      );
    });
  });

  it('supports select all and clear individual lines in value over time group mode', async () => {
    render(
      <AuditTrailChartsSection
        entitlementsRows={entitlementsRows}
        entries={entries}
        locale="en-US"
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'By group' })[1]!);

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));

    await waitFor(() => {
      expect(screen.getByTestId('value-over-time-chart')).toHaveAttribute(
        'data-series',
        'api-calls,storage-gb',
      );
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear individual lines' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('value-over-time-chart')).toHaveAttribute(
        'data-series',
        '',
      );
    });
  });

  it('hides the visible entitlements selector and only keeps the group total when a group has one numeric entitlement', async () => {
    render(
      <AuditTrailChartsSection
        entitlementsRows={entitlementsRows}
        entries={entries}
        locale="en-US"
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'By group' })[1]!);
    fireEvent.change(screen.getAllByRole('combobox')[2] as HTMLSelectElement, {
      target: { value: 'usage' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('value-over-time-chart')).toHaveAttribute(
        'data-series',
        '',
      );
    });

    expect(
      screen.queryByRole('button', { name: 'Visible entitlements' }),
    ).not.toBeInTheDocument();
  });
});
