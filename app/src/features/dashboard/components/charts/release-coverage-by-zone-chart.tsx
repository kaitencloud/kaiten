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
import { getReleaseCoverageByZoneChartConfig } from '../../utils/chart-configs';
import { VERTICAL_BAR_TOP_RADIUS } from './bar-radius-utils';
import { ChartShell } from './chart-shell';

type ReleaseCoverageByZoneChartProps = {
  data: DashboardMetrics['charts']['releaseCoverageByZone'];
};

function roundedBarShape(shapeProps: unknown) {
  const props = shapeProps as ComponentProps<typeof Rectangle> & {
    payload?: { zones?: number };
  };
  const value = props.payload?.zones ?? 0;
  return (
    <Rectangle {...props} radius={value > 0 ? VERTICAL_BAR_TOP_RADIUS : 0} />
  );
}

function renderZoneCell(
  entry: DashboardMetrics['charts']['releaseCoverageByZone'][number],
) {
  return <Cell key={entry.release} fill={entry.fill} />;
}

export const ReleaseCoverageByZoneChart = ({
  data,
}: ReleaseCoverageByZoneChartProps) => {
  const { t } = useTranslation();
  const chartConfig = getReleaseCoverageByZoneChartConfig(t);

  function formatReleaseLabel(value: unknown) {
    return value === '__unassigned__'
      ? t('Pages.Dashboard.charts.releaseCoverageByZone.unassigned')
      : String(value);
  }

  // One grey "Unassigned" bar is not coverage: say so, with the count.
  const unassignedOnly =
    data.length > 0 &&
    data.every((entry) => entry.release === '__unassigned__');
  const unassignedZones = data.reduce((sum, entry) => sum + entry.zones, 0);

  return (
    <ChartShell
      title={t('Pages.Dashboard.charts.releaseCoverageByZone.title')}
      description={t(
        'Pages.Dashboard.charts.releaseCoverageByZone.description',
      )}
    >
      {data.length === 0 ? (
        <ChartEmptyState
          message={t('Pages.Dashboard.charts.releaseCoverageByZone.emptyState')}
        />
      ) : unassignedOnly ? (
        <ChartEmptyState
          message={t(
            'Pages.Dashboard.charts.releaseCoverageByZone.allUnassigned',
            { count: unassignedZones },
          )}
        />
      ) : (
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ left: 8, right: 8, top: 12 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="release"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              tickFormatter={(value) => formatReleaseLabel(value).slice(0, 10)}
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
            <Bar dataKey="zones" shape={roundedBarShape}>
              {data.map(renderZoneCell)}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartShell>
  );
};
