import { fireEvent, render as renderComponent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse } from 'msw';
import { server } from '@/__tests__/msw-server';
import { handleListUsageReports } from '@/api-client/msw.gen';

function render(element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return renderComponent(element, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { InstanceDetailEntitlementsTab } from '../instance-detail-entitlements-tab';
vi.mock('../../../../../entitlement-exceptions/exceptions-card', () => ({ ExceptionsCard: () => null }));
const { drawer, navigate, navigateTo, historyPermission } = vi.hoisted(() => ({
  historyPermission: { allowed: true },
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
  useCanPerform: () => historyPermission.allowed,
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

beforeEach(() => {
  drawer.mockClear();
  navigateTo.mockClear();
  historyPermission.allowed = true;
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

    it.each(['sso', ''])(
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

it('keeps an invoice-linked hidden/deleted journal usable without exposing an operational row', async () => {
  const read = vi.fn(({ request }: { request: Request }) => {
    const url = new URL(request.url);
    expect(url.pathname).toBe('/api/instances/instance/entitlements/deleted-ai-pool/usage/reports');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('from')).toBeNull();
    expect(url.searchParams.get('to')).toBeNull();
    return HttpResponse.json({ items: [{ reportSeq: 1, delta: '800' }] });
  });
  server.use(handleListUsageReports(read));
  useInstanceDetailMock.mockReturnValue({ instance: { id: 'ins', slug: 'instance', name: 'Instance' }, entitlementsRows: [], canonicalEntitlementsRows: [], entitlementsMetrics: { total: 0, enabled: 0, nearThreshold: 0, numberEntitlements: [] } });
  render(<InstanceDetailEntitlementsTab historyParam="deleted-ai-pool" historyRange={{ from: '2026-10-01T00:00:00Z', to: '2026-10-27T00:00:00Z' }} />);
  await waitFor(() => expect(drawer).toHaveBeenCalledWith(expect.objectContaining({ entitlementSlug: 'deleted-ai-pool', entitlementName: 'deleted-ai-pool', range: { from: '2026-10-01T00:00:00Z', to: '2026-10-27T00:00:00Z' } })));
  expect(read).toHaveBeenCalledOnce();
  expect(screen.queryByText('deleted-ai-pool')).toBeNull();
  expect(navigateTo).not.toHaveBeenCalled();
});

it('opens a valid hidden journal even when the selected period and default probe have no reports', async () => {
  missingTarget();
  const read = vi.fn(({ request }: { request: Request }) => {
    const url = new URL(request.url);
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.has('from')).toBe(false);
    expect(url.searchParams.has('to')).toBe(false);
    // ListUsageReports resolves the pair before its range. 200 is a valid pair;
    // the missing slug case below returns the actual API's typed 404 instead.
    return HttpResponse.json({ items: [] });
  });
  server.use(handleListUsageReports(read));
  const range = { from: '2025-01-01T00:00:00Z', to: '2025-02-01T00:00:00Z' };
  render(<InstanceDetailEntitlementsTab historyParam="deleted-ai-pool" historyRange={range} />);
  await waitFor(() => expect(drawer).toHaveBeenCalledWith(expect.objectContaining({ entitlementSlug: 'deleted-ai-pool', range })));
  expect(navigateTo).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledOnce();
});

function missingTarget() {
  useInstanceDetailMock.mockReturnValue({
    instance: { id: 'ins', slug: 'instance', name: 'Instance' },
    entitlementsRows: [], canonicalEntitlementsRows: [],
    entitlementsMetrics: { total: 0, enabled: 0, nearThreshold: 0, numberEntitlements: [] },
  });
}

it('keeps the ordinary page and its URL while an unknown journal is being checked, then drops a missing link', async () => {
  missingTarget();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const read = vi.fn(async () => { await pending; return HttpResponse.json({ code: 'ListUsageReports.EntitlementNotFound' }, { status: 404 }); });
  server.use(handleListUsageReports(read));
  render(<InstanceDetailEntitlementsTab historyParam="no-such-counter" />);
  await waitFor(() => expect(read).toHaveBeenCalledOnce());
  expect(drawer).not.toHaveBeenCalled();
  expect(navigateTo).not.toHaveBeenCalled();
  expect(screen.getByText('All entitlements')).toBeInTheDocument();
  release();
  await waitFor(() => expect(navigateTo).toHaveBeenCalled());
  expect(drawer).not.toHaveBeenCalled();
  const { replace, search } = navigateTo.mock.calls[0][0];
  expect(replace).toBe(true);
  expect(search({ history: 'no-such-counter', other: 1 })).toEqual({ history: undefined, other: 1 });
});

it('does not open an unknown journal after a failed financial read', async () => {
  missingTarget();
  const read = vi.fn(() => HttpResponse.json({ code: 'Unauthorized' }, { status: 403 }));
  server.use(handleListUsageReports(read));
  render(<InstanceDetailEntitlementsTab historyParam="deleted-ai-pool" />);
  await waitFor(() => expect(navigateTo).toHaveBeenCalled());
  expect(drawer).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledOnce();
});

it('does not probe or open a missing journal without the existing financial read permission', () => {
  missingTarget();
  historyPermission.allowed = false;
  const read = vi.fn(() => HttpResponse.json({ items: [{ reportSeq: 1 }] }));
  server.use(handleListUsageReports(read));
  render(<InstanceDetailEntitlementsTab historyParam="deleted-ai-pool" />);
  expect(navigateTo).toHaveBeenCalled();
  expect(drawer).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});

it('keeps a hidden canonical AI journal link without an extra missing-target probe', () => {
  missingTarget();
  const state = useInstanceDetailMock();
  useInstanceDetailMock.mockReturnValue({ ...state, canonicalEntitlementsRows: [{
    enabled: true, entitlementId: 'credits', entitlementSlug: 'credits', entitlementName: 'AI credits',
    entitlementType: 'NUMBER', catalogueEntitlementType: 'NUMBER_AI_CREDIT',
    currentPeriodStart: '2026-10-01T00:00:00Z', currentPeriodEnd: '2026-11-01T00:00:00Z',
    entitlementGroups: [], threshold: 1000, value: 800,
  }] });
  const read = vi.fn(() => HttpResponse.json({ items: [] }));
  server.use(handleListUsageReports(read));
  render(<InstanceDetailEntitlementsTab historyParam="credits" />);
  expect(drawer).toHaveBeenCalledWith(expect.objectContaining({ entitlementSlug: 'credits', entitlementName: 'AI credits' }));
  expect(read).not.toHaveBeenCalled();
  expect(screen.queryByText('AI credits')).not.toBeInTheDocument();
});

it('keeps a proven deleted journal open across empty periods without treating another slug as proven', async () => {
  missingTarget();
  const read = vi.fn(({ params }: { params: { entitlementSlug: string } }) =>
    params.entitlementSlug === 'deleted-ai-pool'
      ? HttpResponse.json({ items: [{ reportSeq: 1 }] })
      : HttpResponse.json({ code: 'ListUsageReports.EntitlementNotFound' }, { status: 404 }),
  );
  server.use(handleListUsageReports(read));
  const { rerender } = render(<InstanceDetailEntitlementsTab historyParam="deleted-ai-pool" />);
  await waitFor(() => expect(drawer).toHaveBeenCalled());
  drawer.mockClear();
  rerender(<InstanceDetailEntitlementsTab historyParam="deleted-ai-pool" historyRange={{ from: '2027-01-01T00:00:00Z' }} />);
  expect(drawer).toHaveBeenCalledWith(expect.objectContaining({
    entitlementSlug: 'deleted-ai-pool', range: { from: '2027-01-01T00:00:00Z' },
  }));
  expect(read).toHaveBeenCalledOnce();
  expect(navigateTo).not.toHaveBeenCalled();
  drawer.mockClear();
  rerender(<InstanceDetailEntitlementsTab historyParam="no-such-counter" />);
  await waitFor(() => expect(navigateTo).toHaveBeenCalled());
  expect(read).toHaveBeenCalledTimes(2);
  expect(drawer).not.toHaveBeenCalled();
});
