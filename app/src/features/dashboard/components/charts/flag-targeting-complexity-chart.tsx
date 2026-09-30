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
import { getFlagTargetingComplexityChartConfig } from '../../utils/chart-configs';
import { VERTICAL_BAR_TOP_RADIUS } from './bar-radius-utils';
import { ChartShell } from './chart-shell';

type FlagTargetingComplexityChartProps = {
  data: DashboardMetrics['charts']['flagTargetingComplexity'];
};

function roundedBarShape(shapeProps: unknown) {
  const props = shapeProps as ComponentProps<typeof Rectangle> & {
    payload?: { count?: number };
  };
  const value = props.payload?.count ?? 0;
  return (
    <Rectangle {...props} radius={value > 0 ? VERTICAL_BAR_TOP_RADIUS : 0} />
  );
}

function renderComplexityCell(
  entry: DashboardMetrics['charts']['flagTargetingComplexity'][number],
) {
  return <Cell key={entry.bucket} fill={entry.fill} />;
}

export const FlagTargetingComplexityChart = ({
  data,
}: FlagTargetingComplexityChartProps) => {
  const { t } = useTranslation();
  const chartConfig = getFlagTargetingComplexityChartConfig(t);

  return (
    <ChartShell
      title={t('Pages.Dashboard.charts.flagTargetingComplexity.title')}
      description={t(
        'Pages.Dashboard.charts.flagTargetingComplexity.description',
      )}
    >
      {data.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ left: 8, right: 8, top: 12 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="bucket"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar dataKey="count" shape={roundedBarShape}>
              {data.map(renderComplexityCell)}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartShell>
  );
};
