import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Rectangle,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartEmptyState } from '@/components/chart-empty-state';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { DashboardMetrics } from '../../hooks/use-dashboard-metrics';
import { getTopCustomersByInstancesChartConfig } from '../../utils/chart-configs';
import { HORIZONTAL_BAR_END_RADIUS } from './bar-radius-utils';
import { ChartShell } from './chart-shell';

type TopCustomersByInstancesChartProps = {
  data: DashboardMetrics['charts']['topCustomersByInstances'];
};

function roundedBarShape(shapeProps: unknown) {
  const props = shapeProps as ComponentProps<typeof Rectangle> & {
    payload?: { instances?: number };
  };
  const value = props.payload?.instances ?? 0;
  return (
    <Rectangle {...props} radius={value > 0 ? HORIZONTAL_BAR_END_RADIUS : 0} />
  );
}

function renderCustomerCell(
  entry: DashboardMetrics['charts']['topCustomersByInstances'][number],
) {
  return <Cell key={entry.customer} fill={entry.fill} />;
}

export const TopCustomersByInstancesChart = ({
  data,
}: TopCustomersByInstancesChartProps) => {
  const { t } = useTranslation();
  const chartConfig = getTopCustomersByInstancesChartConfig(t);

  return (
    <ChartShell
      title={t('Pages.Dashboard.charts.topCustomersByInstances.title')}
      description={t(
        'Pages.Dashboard.charts.topCustomersByInstances.description',
      )}
    >
      {data.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart
            accessibilityLayer
            data={data}
            layout="vertical"
            margin={{ left: 18, right: 12, top: 12 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="customer"
              tickLine={false}
              axisLine={false}
              width={120}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar dataKey="instances" shape={roundedBarShape}>
              {data.map(renderCustomerCell)}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartShell>
  );
};
