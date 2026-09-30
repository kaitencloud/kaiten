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
import { getLicenseExpirationForecastChartConfig } from '../../utils/chart-configs';
import { VERTICAL_BAR_TOP_RADIUS } from './bar-radius-utils';
import { ChartShell } from './chart-shell';

type LicenseExpirationForecastChartProps = {
  data: DashboardMetrics['charts']['licenseExpirationForecast'];
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

function renderForecastCell(
  entry: DashboardMetrics['charts']['licenseExpirationForecast'][number],
) {
  return <Cell key={entry.bucket} fill={entry.fill} />;
}

export const LicenseExpirationForecastChart = ({
  data,
}: LicenseExpirationForecastChartProps) => {
  const { t } = useTranslation();
  const chartConfig = getLicenseExpirationForecastChartConfig(t);

  function formatBucket(bucket: string) {
    switch (bucket) {
      case '0-7d':
        return t(
          'Pages.Dashboard.charts.licenseExpirationForecast.buckets.zeroToSevenDays',
        );
      case '8-30d':
        return t(
          'Pages.Dashboard.charts.licenseExpirationForecast.buckets.eightToThirtyDays',
        );
      case '31-60d':
        return t(
          'Pages.Dashboard.charts.licenseExpirationForecast.buckets.thirtyOneToSixtyDays',
        );
      case '61-90d':
        return t(
          'Pages.Dashboard.charts.licenseExpirationForecast.buckets.sixtyOneToNinetyDays',
        );
      default:
        return t(
          'Pages.Dashboard.charts.licenseExpirationForecast.buckets.overNinetyDays',
        );
    }
  }

  return (
    <ChartShell
      title={t('Pages.Dashboard.charts.licenseExpirationForecast.title')}
      description={t(
        'Pages.Dashboard.charts.licenseExpirationForecast.description',
      )}
    >
      {data.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart data={data} margin={{ left: 8, right: 8, top: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="bucket"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatBucket}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar dataKey="count" shape={roundedBarShape}>
              {data.map(renderForecastCell)}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartShell>
  );
};
