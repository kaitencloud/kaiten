import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { ValueOverTimeChart } from '../audit-trail-charts';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/chart-empty-state', () => ({
  ChartEmptyState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock('@/components/ui/chart', () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  ChartLegend: () => <div data-testid="chart-legend" />,
  ChartLegendContent: () => null,
  ChartTooltip: () => <div data-testid="chart-tooltip" />,
  ChartTooltipContent: () => null,
}));

vi.mock('recharts', () => ({
  Area: ({ dataKey }: { dataKey: string }) => (
    <div data-testid={`area-series-${dataKey}`} />
  ),
  AreaChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  CartesianGrid: () => null,
  Line: ({ dataKey, dot }: { dataKey: string; dot?: unknown }) => (
    <div
      data-testid={`line-series-${dataKey}`}
      data-dot={dot === false ? 'off' : 'on'}
    />
  ),
  LineChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Rectangle: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Bar: () => null,
  BarChart: () => null,
}));

describe('ValueOverTimeChart', () => {
  it('renders an area chart for entitlement mode', () => {
    render(
      <ValueOverTimeChart
        chartData={[{ time: 'Mar 24', value: 10 }]}
        locale="en-US"
        mode="entitlement"
      />,
    );

    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-series-value')).toBeInTheDocument();
  });

  it('renders the group total as an area chart when no individual lines are visible', () => {
    render(
      <ValueOverTimeChart
        chartConfig={{
          groupTotal: {
            color: 'var(--primary)',
            label: 'Group total',
          },
        }}
        chartData={[{ groupTotal: 42, time: 'Mar 24' }]}
        locale="en-US"
        mode="group"
        seriesKeys={[]}
        showLegend
      />,
    );

    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-series-groupTotal')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-legend')).not.toBeInTheDocument();
  });

  // A period-scoped series has no value on a day it was not reported, so its
  // points can be isolated. recharts draws no segment through a lone point, so
  // without a dot the series would paint nothing at all.
  it('gives the per-entitlement lines a visible dot', () => {
    render(
      <ValueOverTimeChart
        chartData={[
          { 'api-calls': 90, groupTotal: 3, time: 'Mar 24' },
          { groupTotal: 4, time: 'Mar 25' },
        ]}
        locale="en-US"
        mode="group"
        seriesKeys={['api-calls']}
      />,
    );

    expect(screen.getByTestId('line-series-api-calls')).toHaveAttribute(
      'data-dot',
      'on',
    );
  });

  // Only period-scoped counters in the group: there is no total that belongs
  // to a single window, so there is nothing to fall back on.
  it('explains the missing total when the group has no lifetime counter', () => {
    render(
      <ValueOverTimeChart
        chartData={[
          { 'api-calls': 90, time: 'Mar 24' },
          { 'api-calls': 120, time: 'Mar 25' },
        ]}
        locale="en-US"
        mode="group"
        seriesKeys={[]}
      />,
    );

    expect(
      screen.getByText(
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.noGroupTotal',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
  });

  // groupTotal is zero here on purpose: a truthiness check instead of an
  // undefined check would wrongly claim the group has no total at all.
  it('still totals a group whose lifetime counters sit at zero', () => {
    render(
      <ValueOverTimeChart
        chartData={[
          { groupTotal: 0, time: 'Mar 24' },
          { groupTotal: 0, time: 'Mar 25' },
        ]}
        locale="en-US"
        mode="group"
        seriesKeys={[]}
      />,
    );

    expect(screen.getByTestId('area-series-groupTotal')).toBeInTheDocument();
  });

  it('keeps the multi-series line chart in group mode when individual lines are visible', () => {
    render(
      <ValueOverTimeChart
        chartConfig={{
          'api-calls': {
            color: 'var(--chart-1)',
            label: 'API Calls',
          },
          groupTotal: {
            color: 'var(--primary)',
            label: 'Group total',
          },
        }}
        chartData={[{ 'api-calls': 12, groupTotal: 42, time: 'Mar 24' }]}
        locale="en-US"
        mode="group"
        seriesKeys={['api-calls']}
        showLegend
      />,
    );

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
    expect(screen.getByTestId('line-series-groupTotal')).toBeInTheDocument();
    expect(screen.getByTestId('line-series-api-calls')).toBeInTheDocument();
    expect(screen.getByTestId('chart-legend')).toBeInTheDocument();
  });
});
