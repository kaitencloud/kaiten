import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import type { UsageReport } from '@/api-client';
import { useUsageReportColumns } from '../components/usage-report-columns';

const report = (overrides: Partial<UsageReport> = {}): UsageReport => ({
  aggregationMethod: 'SUM',
  behavior: 'append',
  delta: '1',
  entitlementId: 'ent-1',
  eventCountAfter: 1,
  instanceId: 'ins-1',
  licenseId: 'lic-1',
  limitValue: '4',
  overageDelta: '0',
  overagePercent: 0,
  properties: null,
  reportSeq: 1,
  reportedAt: '2027-03-02T10:00:00.000Z',
  reportedValue: '1',
  transactionId: null,
  valueAfter: '1',
  valueBefore: '0',
  windowEnd: null,
  windowStart: null,
  ...overrides,
});

const ids = (options: Parameters<typeof useUsageReportColumns>[0]) =>
  renderHook(() => useUsageReportColumns(options)).result.current.map(
    (column) => column.id,
  );

describe('the columns of a table of usage reports', () => {
  const none = new Set<number>();

  it('have no resource column unless the screen asks for it, which only the history of an entitlement that counts per resource does', () => {
    expect(ids({ limitChanges: none })).not.toContain('resource');
    expect(ids({ limitChanges: none, showValue: true })).not.toContain(
      'resource',
    );
  });

  it('put the resource right after the moment of the report, where it says what the rest is about', () => {
    expect(ids({ limitChanges: none, showResource: true })).toEqual([
      'report',
      'reportedAt',
      'resource',
      'behavior',
      'counter',
      'delta',
      'limit',
      'transaction',
      'properties',
    ]);
  });

  it('say the key of the resource as it was reported, and a dash for a report that names none', () => {
    const [, , resource] = renderHook(() =>
      useUsageReportColumns({ limitChanges: none, showResource: true }),
    ).result.current;
    const cell = (row: UsageReport) => {
      const Cell = resource.cell as (context: {
        row: { original: UsageReport };
      }) => React.ReactNode;

      return render(<>{Cell({ row: { original: row } })}</>);
    };

    const named = cell(report({ resourceKey: 'comp:123' }));
    expect(screen.getByText('comp:123')).toHaveClass('font-mono');
    named.unmount();
    cell(report());
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
