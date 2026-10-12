import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { InstanceEntitlementRow } from '../../../../../utils/instance-detail-entitlements.utils';
import { useEntitlementsColumns } from '../instance-detail-entitlements-columns';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
    to,
    ...props
  }: {
    children?: ReactNode;
    params: Record<string, string>;
    search: Record<string, string>;
    to: string;
  }) => (
    <a
      {...props}
      data-params={JSON.stringify(params)}
      data-search={JSON.stringify(search)}
      href={to}
    >
      {children}
    </a>
  ),
}));

// Echoes the key, except for the two strings these tests read, so an assertion
// fails loudly rather than matching a raw key by accident.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'Pages.Customers.Instances.Detail.entitlements.lifetime') {
        return 'Lifetime';
      }
      if (key === 'Pages.Customers.Instances.Detail.entitlements.periodRange') {
        return `${options?.start} → ${options?.end}`;
      }
      if (key === 'Pages.Customers.Instances.Detail.entitlements.unlimited') {
        return 'Unlimited';
      }
      if (
        key === 'Pages.Customers.Instances.Detail.entitlements.softLimitHint'
      ) {
        return `(+${options?.percent}% overage)`;
      }
      if (
        key ===
        'Pages.Customers.Instances.Detail.entitlements.softLimitDescription'
      ) {
        return `Soft limit: usage is accepted up to ${options?.max} before being rejected.`;
      }
      return key;
    },
  }),
}));

const row = (overrides: Partial<InstanceEntitlementRow>) =>
  ({
    entitlementId: 'ent-api',
    entitlementGroups: [],
    entitlementName: 'API Calls',
    entitlementSlug: 'api-calls',
    entitlementType: 'NUMBER',
    value: 10,
    threshold: 100,
    limitCapExceededOveragePercent: 0,
    enabled: true,
    ...overrides,
  }) as InstanceEntitlementRow;

const renderCell = (accessorKey: string, original: InstanceEntitlementRow) => {
  const { result } = renderHook(() => useEntitlementsColumns('en-US'));
  const column = result.current.find(
    (candidate) =>
      (candidate as { accessorKey?: string }).accessorKey === accessorKey,
  );

  if (!column?.cell || typeof column.cell !== 'function') {
    throw new Error(`${accessorKey} column has no cell renderer`);
  }

  render(<>{column.cell({ row: { original } } as never)}</>);
};

const renderCurrentPeriodCell = (original: InstanceEntitlementRow) =>
  renderCell('currentPeriodStart', original);

const renderThresholdCell = (original: InstanceEntitlementRow) =>
  renderCell('threshold', original);

describe('current window column', () => {
  // The API defines these windows on UTC boundaries and the anchor help text
  // promises exactly that, so rendering them in the viewer's zone would show a
  // March calendar month as "Feb 28 -> Mar 31" west of Greenwich.
  it('renders the bounds on their UTC boundaries, not the viewer clock', () => {
    renderCurrentPeriodCell(
      row({
        currentPeriodStart: '2026-03-01T00:00:00.000Z',
        currentPeriodEnd: '2026-04-01T00:00:00.000Z',
      }),
    );

    expect(
      screen.getByText('Mar 1, 2026, 12:00 AM UTC → Apr 1, 2026, 12:00 AM UTC'),
    ).toBeInTheDocument();
  });

  it('calls a number entitlement without bounds a lifetime counter', () => {
    renderCurrentPeriodCell(row({}));

    expect(screen.getByText('Lifetime')).toBeInTheDocument();
  });

  // A window is a counter notion, so the non-numeric types get the same dash
  // the threshold column gives them rather than a lifetime label.
  it.each(['BOOLEAN', 'CONFIG'] as const)(
    'leaves the window blank for a %s entitlement',
    (entitlementType) => {
      renderCurrentPeriodCell(row({ entitlementType }));

      expect(screen.queryByText('Lifetime')).not.toBeInTheDocument();
      expect(screen.getByText('-')).toBeInTheDocument();
    },
  );
});

describe('threshold column', () => {
  // The granted figure stays the headline number; the overage hangs off it so
  // the row still matches the license while saying how far past it usage may
  // run.
  it('hangs the overage allowance off a soft limit', () => {
    renderThresholdCell(
      row({ threshold: 1000, limitCapExceededOveragePercent: 20 }),
    );

    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText('(+20% overage)')).toBeInTheDocument();
  });

  it('spells the effective ceiling out in the hint title', () => {
    renderThresholdCell(
      row({ threshold: 1000, limitCapExceededOveragePercent: 20 }),
    );

    expect(screen.getByText('(+20% overage)')).toHaveAttribute(
      'title',
      'Soft limit: usage is accepted up to 1,200 before being rejected.',
    );
  });

  it('leaves a hard limit unadorned', () => {
    renderThresholdCell(
      row({ threshold: 1000, limitCapExceededOveragePercent: 0 }),
    );

    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.queryByText(/overage/)).not.toBeInTheDocument();
  });

  it('leaves an unlimited threshold unadorned', () => {
    renderThresholdCell(
      row({ threshold: -1, limitCapExceededOveragePercent: -1 }),
    );

    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.queryByText(/overage/)).not.toBeInTheDocument();
  });

  it.each(['BOOLEAN', 'CONFIG'] as const)(
    'leaves a %s entitlement unadorned',
    (entitlementType) => {
      renderThresholdCell(
        row({
          entitlementType,
          threshold: null,
          limitCapExceededOveragePercent: null,
        }),
      );

      expect(screen.getByText('-')).toBeInTheDocument();
      expect(screen.queryByText(/overage/)).not.toBeInTheDocument();
    },
  );
});

const segment = (name: string) =>
  document.querySelector<HTMLElement>(`[data-segment="${name}"]`);

describe('usage column', () => {
  // The bug this replaces: at the granted value a 20% soft limit still had
  // room, but the bar rendered full. The meter stops at the grant tick and
  // draws the allowance after it.
  it('stops the fill at the grant and draws the allowance after it', () => {
    renderCell(
      'value',
      row({ value: 1000, threshold: 1000, limitCapExceededOveragePercent: 20 }),
    );

    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(
      Number.parseFloat(segment('contract')?.style.width ?? ''),
    ).toBeCloseTo(83.33, 1);
    expect(segment('band')).not.toBeNull();
  });

  it('still fills the bar at a hard limit', () => {
    renderCell(
      'value',
      row({ value: 1000, threshold: 1000, limitCapExceededOveragePercent: 0 }),
    );

    expect(segment('contract')?.style.width).toBe('100%');
    expect(segment('band')).toBeNull();
  });
});

describe('status column', () => {
  it('reads a counter status off its usage against the grant', () => {
    renderCell(
      'enabled',
      row({
        enabled: null,
        limitCapExceededOveragePercent: 20,
        threshold: 1000,
        value: 1100,
      }),
    );

    expect(
      screen.getByText('Features.EntitlementUsage.status.inAllowance'),
    ).toBeInTheDocument();
  });

  it('keeps the enabled flag for an on/off grant', () => {
    renderCell(
      'enabled',
      row({
        enabled: true,
        entitlementType: 'BOOLEAN',
        limitCapExceededOveragePercent: null,
        threshold: null,
        value: 1,
      }),
    );

    expect(
      screen.getByText(
        'Pages.Customers.Instances.Detail.entitlements.status.enabled',
      ),
    ).toBeInTheDocument();
  });
});

describe('history column', () => {
  const history = { instanceSlug: 'globex-production' };

  const historyColumn = (options?: Parameters<typeof useEntitlementsColumns>[1]) =>
    renderHook(() => useEntitlementsColumns('en-US', options)).result.current.find(
      (column) => (column as { id?: string }).id === 'history',
    );

  it('is offered only to a session that may read the history', () => {
    expect(historyColumn()).toBeUndefined();
    expect(historyColumn({ history })).toBeDefined();
  });

  it('links a counter to its history, over the same page, and says whose it is', () => {
    const column = historyColumn({ history });
    if (!column?.cell || typeof column.cell !== 'function') {
      throw new Error('the history column has no cell renderer');
    }

    render(<>{column.cell({ row: { original: row({}) } } as never)}</>);

    const link = screen.getByRole('link', {
      name: 'Pages.Customers.Instances.Detail.entitlements.history.openLabel',
    });
    expect(link).toHaveAttribute('href', '/customers/instances/$instanceSlug/entitlements');
    expect(link).toHaveAttribute('data-search', '{"history":"api-calls"}');
    expect(link).toHaveAttribute('data-params', '{"instanceSlug":"globex-production"}');
  });

  it.each(['BOOLEAN', 'CONFIG'] as const)(
    'offers no history for a %s entitlement, which reports no usage',
    (entitlementType) => {
      const column = historyColumn({ history });
      if (!column?.cell || typeof column.cell !== 'function') {
        throw new Error('the history column has no cell renderer');
      }

      render(<>{column.cell({ row: { original: row({ entitlementType }) } } as never)}</>);

      expect(screen.queryByRole('link')).toBeNull();
    },
  );
});
