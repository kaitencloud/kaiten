import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { InstanceDetailEntitlementsTab } from '../instance-detail-entitlements-tab';
const { drawer, navigate, navigateTo } = vi.hoisted(() => ({
  drawer: vi.fn(),
  navigate: vi.fn(),
  navigateTo: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children?: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  Navigate: (props: unknown) => {
    navigateTo(props);

    return null;
  },
  useNavigate: () => navigate,
  useRouter: () => ({ navigate: vi.fn() }),
}));

// The scopes of the session are read from its token, which these tests have none of.
vi.mock('@/domains/billing', () => ({
  useCanPerform: () => true,
}));

vi.mock('../usage-history', () => ({
  UsageHistoryDrawer: (props: unknown) => {
    drawer(props);

    return <div data-testid="usage-history" />;
  },
}));

const { useInstanceDetailMock } = vi.hoisted(() => ({
  useInstanceDetailMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      resolvedLanguage: 'en-US',
    },
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'Pages.Customers.Instances.Detail.entitlements.filters.allGroups':
          'All groups',
        'Pages.Customers.Instances.Detail.entitlements.filters.clear':
          'Clear filter',
        'Pages.Customers.Instances.Detail.entitlements.filters.groupLabel':
          'Filter entitlements by group',
        'Pages.Customers.Instances.Detail.entitlements.table.title':
          'All entitlements',
        'Pages.Customers.Instances.Detail.entitlements.table.description':
          'Detailed view of all entitlements associated via the license',
        'Pages.Customers.Instances.Detail.entitlements.table.headers.entitlement':
          'Entitlement',
        'Pages.Customers.Instances.Detail.entitlements.table.headers.type':
          'Type',
        'Pages.Customers.Instances.Detail.entitlements.table.headers.usage':
          'Usage',
        'Pages.Customers.Instances.Detail.entitlements.table.headers.threshold':
          'Threshold',
        'Pages.Customers.Instances.Detail.entitlements.table.headers.status':
          'Status',
        'Pages.Customers.Instances.Detail.entitlements.status.enabled':
          'Enabled',
        'Pages.Customers.Instances.Detail.entitlements.status.disabled':
          'Disabled',
        'Pages.Customers.Instances.Detail.entitlements.status.unknown':
          'Unknown',
        'Pages.Customers.Instances.Detail.entitlements.usage.title':
          'Usage overview',
        'Pages.Customers.Instances.Detail.entitlements.usage.description':
          'Usage overview description',
        'Pages.Customers.Instances.Detail.entitlements.usage.currentWindow':
          `Current window: ${options?.start} → ${options?.end}`,
        'Pages.Customers.Instances.Detail.entitlements.empty':
          'No entitlement usage data available',
        'Pages.Customers.Instances.Detail.entitlements.unlimited': 'Unlimited',
        'Pages.Customers.Instances.Detail.entitlements.lifetime': 'Lifetime',
      };

      if (key === 'Pages.Customers.Instances.Detail.entitlements.softLimitHint') {
        return `(+${String(options?.percent)}% overage)`;
      }

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('../../../instance-detail-context', () => ({
  useInstanceDetail: useInstanceDetailMock,
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

vi.mock('@/functionals/table', () => {
  const Table = ({ data }: { data: Array<{ entitlementId: string; entitlementName: string }> }) => (
    <div>
      {data.map((row) => (
        <div key={row.entitlementId}>{row.entitlementName}</div>
      ))}
    </div>
  );

  const TableCardRoot = ({ children }: { children: ReactNode }) => <div>{children}</div>;

  return {
    TableCard: Object.assign(TableCardRoot, {
      Header: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      HeaderLeading: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      HeaderIcon: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      HeaderHeading: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      HeaderTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      HeaderSubtitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Table,
    }),
  };
});

describe('InstanceDetailEntitlementsTab', () => {
  beforeEach(() => {
    drawer.mockClear();
    navigate.mockClear();
    navigateTo.mockClear();
    useInstanceDetailMock.mockReturnValue({
      instance: { id: 'ins-1', name: 'Globex Production', slug: 'globex-production' },
      entitlementsRows: [
        {
          enabled: true,
          entitlementGroups: [{ id: 'group-usage', name: 'Usage', slug: 'usage' }],
          entitlementId: 'ent-api',
          entitlementName: 'API Calls',
          entitlementSlug: 'api-calls',
          entitlementType: 'NUMBER',
          currentPeriodStart: '2026-03-01T00:00:00.000Z',
          currentPeriodEnd: '2026-04-01T00:00:00.000Z',
          threshold: 100,
          value: 10,
        },
        {
          enabled: true,
          entitlementGroups: [{ id: 'group-billing', name: 'Billing', slug: 'billing' }],
          entitlementId: 'ent-storage',
          entitlementName: 'Storage',
          entitlementSlug: 'storage-gb',
          entitlementType: 'NUMBER',
          threshold: 200,
          value: 50,
        },
      ],
      entitlementsMetrics: {
        enabled: 2,
        nearThreshold: 0,
        numberEntitlements: [],
        total: 2,
      },
    });
  });

  it('filters the entitlement list by selected group', () => {
    render(<InstanceDetailEntitlementsTab />);

    expect(screen.getAllByText('API Calls').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Storage').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'billing' },
    });

    expect(screen.queryAllByText('API Calls')).toHaveLength(0);
    expect(screen.getAllByText('Storage').length).toBeGreaterThan(0);
  });

  // The two bars on this instance do not share a window -- one resets monthly,
  // the other never does -- which is why the card annotates each bar instead of
  // captioning the whole card with a single window.
  it('gives every usage bar its own window, pinned to UTC', () => {
    render(<InstanceDetailEntitlementsTab />);

    expect(
      screen.getByText(
        'Current window: Mar 1, 2026, 12:00 AM UTC → Apr 1, 2026, 12:00 AM UTC',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Lifetime')).toBeInTheDocument();
  });

  // The percentage measures what the grant permits, so the granted figure
  // beside it has to state its allowance or the line contradicts itself.
  it('states the allowance its usage percentage is measured against', () => {
    useInstanceDetailMock.mockReturnValue({
      instance: { id: 'ins-1', name: 'Globex Production', slug: 'globex-production' },
      entitlementsRows: [
        {
          enabled: true,
          entitlementGroups: [],
          entitlementId: 'ent-seats',
          entitlementName: 'Seats',
          entitlementSlug: 'seats',
          entitlementType: 'NUMBER',
          limitCapExceededOveragePercent: 25,
          threshold: 100,
          value: 110,
        },
      ],
      entitlementsMetrics: {
        enabled: 1,
        nearThreshold: 1,
        numberEntitlements: [],
        total: 1,
      },
    });

    render(<InstanceDetailEntitlementsTab />);

    expect(screen.getByText('(+25% overage)')).toBeInTheDocument();
    expect(screen.getByText('(88%)')).toBeInTheDocument();
  });

  // The gap that let a "+0% overage" hint reach the card: nothing announces an
  // allowance a hard limit does not have.
  it('announces no allowance for a hard limit', () => {
    useInstanceDetailMock.mockReturnValue({
      instance: { id: 'ins-1', name: 'Globex Production', slug: 'globex-production' },
      entitlementsRows: [
        {
          enabled: true,
          entitlementGroups: [],
          entitlementId: 'ent-api',
          entitlementName: 'API Calls',
          entitlementSlug: 'api-calls',
          entitlementType: 'NUMBER',
          limitCapExceededOveragePercent: 0,
          threshold: 1000,
          value: 1000,
        },
      ],
      entitlementsMetrics: {
        enabled: 1,
        nearThreshold: 0,
        numberEntitlements: [],
        total: 1,
      },
    });

    render(<InstanceDetailEntitlementsTab />);

    expect(screen.queryByText(/overage/)).not.toBeInTheDocument();
    expect(screen.getByText('(100%)')).toBeInTheDocument();
  });

  it('draws no meter for a grant nothing caps', () => {
    useInstanceDetailMock.mockReturnValue({
      instance: { id: 'ins-1', name: 'Globex Production', slug: 'globex-production' },
      entitlementsRows: [
        {
          enabled: true,
          entitlementGroups: [],
          entitlementId: 'ent-storage',
          entitlementName: 'Storage',
          entitlementSlug: 'storage-gb',
          entitlementType: 'NUMBER',
          limitCapExceededOveragePercent: -1,
          threshold: -1,
          value: 5000,
        },
      ],
      entitlementsMetrics: {
        enabled: 1,
        nearThreshold: 0,
        numberEntitlements: [],
        total: 1,
      },
    });

    render(<InstanceDetailEntitlementsTab />);

    // An uncapped grant has nothing to fill: no percentage, and no track that
    // would read as barely used.
    expect(screen.queryByText('(0%)')).not.toBeInTheDocument();
    expect(screen.queryByText(/overage/)).not.toBeInTheDocument();
  });

  it('keeps each bar labelled once the group filter narrows the card', () => {
    render(<InstanceDetailEntitlementsTab />);

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'billing' },
    });

    expect(screen.getByText('Lifetime')).toBeInTheDocument();
    expect(screen.queryByText(/^Current window:/)).not.toBeInTheDocument();
  });
  describe('the usage history the URL opens', () => {
    it('opens the drawer on the counter a link names, with the instance it is of', () => {
      render(<InstanceDetailEntitlementsTab historyParam="api-calls" />);

      expect(screen.getByTestId('usage-history')).toBeInTheDocument();
      expect(drawer).toHaveBeenCalledWith(
        expect.objectContaining({
          entitlementName: 'API Calls',
          entitlementSlug: 'api-calls',
          instanceName: 'Globex Production',
          instanceSlug: 'globex-production',
        }),
      );
      expect(navigateTo).not.toHaveBeenCalled();
    });

    it('hands the drawer the period the URL holds, and writes a new one to it without a new history entry', () => {
      render(
        <InstanceDetailEntitlementsTab
          historyParam="api-calls"
          historyRange={{ from: '2027-03-01T00:00:00.000Z' }}
        />,
      );

      const props = drawer.mock.calls[0][0] as {
        onRangeChange: (range: { from?: string; to?: string }) => void;
        range: unknown;
      };
      expect(props.range).toEqual({ from: '2027-03-01T00:00:00.000Z' });
      props.onRangeChange({
        from: '2027-03-01T00:00:00.000Z',
        to: '2027-04-01T00:00:00.000Z',
      });

      const { replace, search, to } = navigate.mock.calls[0][0] as {
        replace: boolean;
        search: (previous: Record<string, unknown>) => unknown;
        to: string;
      };
      expect(replace).toBe(true);
      expect(to).toBe('/customers/instances/$instanceSlug/entitlements');
      expect(search({ history: 'api-calls' })).toEqual({
        from: '2027-03-01T00:00:00.000Z',
        history: 'api-calls',
        to: '2027-04-01T00:00:00.000Z',
      });
    });

    it('takes the period away with the drawer when it closes', () => {
      render(
        <InstanceDetailEntitlementsTab
          historyParam="api-calls"
          historyRange={{ from: '2027-03-01T00:00:00.000Z' }}
        />,
      );

      (drawer.mock.calls[0][0] as { onClose: () => void }).onClose();

      const { search } = navigate.mock.calls[0][0] as {
        search: (previous: Record<string, unknown>) => Record<string, unknown>;
      };
      expect(
        search({
          from: '2027-03-01T00:00:00.000Z',
          history: 'api-calls',
          other: 1,
        }),
      ).toStrictEqual({
        from: undefined,
        history: undefined,
        other: 1,
        to: undefined,
      });
    });

    it('opens nothing when there is no link to follow', () => {
      render(<InstanceDetailEntitlementsTab />);

      expect(screen.queryByTestId('usage-history')).toBeNull();
      expect(navigateTo).not.toHaveBeenCalled();
    });

    it.each(['sso', 'seats', ''])(
      'drops the link %j, which names no counter of this instance, and opens the page as it is',
      (historyParam) => {
        useInstanceDetailMock.mockReturnValue({
          instance: {
            id: 'ins-1',
            name: 'Globex Production',
            slug: 'globex-production',
          },
          entitlementsRows: [
            {
              enabled: true,
              entitlementGroups: [],
              entitlementId: 'ent-sso',
              entitlementName: 'SSO',
              entitlementSlug: 'sso',
              entitlementType: 'BOOLEAN',
              threshold: null,
              value: 1,
            },
          ],
          entitlementsMetrics: {
            enabled: 1,
            nearThreshold: 0,
            numberEntitlements: [],
            total: 1,
          },
        });
        render(<InstanceDetailEntitlementsTab historyParam={historyParam} />);

        expect(screen.queryByTestId('usage-history')).toBeNull();
        expect(navigateTo).toHaveBeenCalledTimes(1);
        const { replace, search, to } = navigateTo.mock.calls[0][0] as {
          replace: boolean;
          search: (previous: Record<string, unknown>) => unknown;
          to: string;
        };
        expect(replace).toBe(true);
        expect(to).toBe('/customers/instances/$instanceSlug/entitlements');
        expect(search({ history: historyParam, other: 1 })).toEqual({
          history: undefined,
          other: 1,
        });
      },
    );
  });
});
