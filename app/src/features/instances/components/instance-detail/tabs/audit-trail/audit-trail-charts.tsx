import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Rectangle,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartEmptyState } from '@/components/chart-empty-state';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  activityTimelineStackTopRadius,
  buildValueChartConfig,
  VALUE_Y_AXIS_TICK,
} from './audit-trail-chart-configs';
import type {
  ActivityTimelineMode,
  ValueOverTimeDatum,
  ValueOverTimeGroupDatum,
} from './audit-trail.utils';

// Pure chart-config builders live in `audit-trail-chart-configs.ts`;
// re-exported here so hooks (and their module mocks) keep a single source.
export {
  buildActivityTimelineGroupChartConfig,
  buildActivityTimelineStatusChartConfig,
  buildValueOverTimeGroupChartConfig,
} from './audit-trail-chart-configs';

const EMPTY_SERIES_KEYS: string[] = [];

type ActivityTimelineChartDatum = {
  day: string;
} & Record<string, number | string>;

function SingleSeriesValueAreaChart({
  chartConfig,
  chartData,
  dataKey,
  gradientId,
  locale,
}: {
  chartConfig: ChartConfig;
  // A key may be absent on a given day: a period-scoped series has no value to
  // plot on a day it was not reported, which recharts renders as a gap.
  chartData: Array<Record<string, number | string | undefined>>;
  dataKey: string;
  gradientId: string;
  locale: string;
}) {
  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[240px] w-full justify-start"
    >
      <AreaChart
        accessibilityLayer
        data={chartData}
        margin={{ left: 0, right: 8, top: 8 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor={`var(--color-${dataKey})`}
              stopOpacity={0.3}
            />
            <stop
              offset="95%"
              stopColor={`var(--color-${dataKey})`}
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="time"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          tick={VALUE_Y_AXIS_TICK}
          tickFormatter={(value: number) => value.toLocaleString(locale)}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={`var(--color-${dataKey})`}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export function ActivityTimelineChart({
  chartConfig,
  chartData,
  mode,
  seriesKeys,
}: {
  chartConfig: ChartConfig;
  chartData: ActivityTimelineChartDatum[];
  mode: ActivityTimelineMode;
  seriesKeys: string[];
}) {
  const { t } = useTranslation();

  if (chartData.length === 0 || seriesKeys.length === 0) {
    return (
      <ChartEmptyState
        message={t(
          'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.empty',
        )}
      />
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[280px] w-full justify-start"
    >
      <BarChart
        accessibilityLayer
        data={chartData}
        margin={{ left: 0, right: 8, top: 8 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {mode === 'status' ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
        {seriesKeys.map((seriesKey) => (
          <Bar
            key={seriesKey}
            dataKey={seriesKey}
            stackId="s"
            fill={`var(--color-${seriesKey})`}
            shape={(shapeProps: unknown) => {
              const props = shapeProps as ComponentProps<typeof Rectangle> & {
                payload?: Record<string, unknown>;
              };

              return (
                <Rectangle
                  {...props}
                  radius={activityTimelineStackTopRadius(
                    seriesKey,
                    seriesKeys,
                    props.payload,
                  )}
                />
              );
            }}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export function ValueOverTimeChart({
  chartData,
  chartConfig,
  locale,
  mode,
  showLegend = false,
  seriesKeys = EMPTY_SERIES_KEYS,
}: {
  chartConfig?: ChartConfig;
  chartData: ValueOverTimeDatum[] | ValueOverTimeGroupDatum[];
  locale: string;
  mode: 'entitlement' | 'group';
  seriesKeys?: string[];
  showLegend?: boolean;
}) {
  const { t } = useTranslation();
  const defaultChartConfig = useMemo(() => buildValueChartConfig(t), [t]);
  const resolvedChartConfig = chartConfig ?? defaultChartConfig;

  if (chartData.length === 0) {
    return (
      <ChartEmptyState
        message={t(
          mode === 'group'
            ? 'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.emptyGroup'
            : 'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.empty',
        )}
      />
    );
  }

  if (mode === 'group') {
    const groupChartData = chartData as ValueOverTimeGroupDatum[];
    // Absent on every point when the group has only period-scoped counters:
    // there is nothing to total that belongs to one window.
    const hasGroupTotal = groupChartData.some(
      (point) => point.groupTotal !== undefined,
    );

    if (seriesKeys.length === 0) {
      if (!hasGroupTotal) {
        return (
          <ChartEmptyState
            message={t(
              'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.noGroupTotal',
            )}
          />
        );
      }

      return (
        <SingleSeriesValueAreaChart
          chartConfig={resolvedChartConfig}
          chartData={groupChartData}
          dataKey="groupTotal"
          gradientId="grad-value-group-total"
          locale={locale}
        />
      );
    }

    return (
      <ChartContainer
        config={resolvedChartConfig}
        className="aspect-auto h-[240px] w-full justify-start"
      >
        <LineChart
          accessibilityLayer
          data={groupChartData}
          margin={{ left: 0, right: 8, top: 8 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="time"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={36}
            tick={VALUE_Y_AXIS_TICK}
            tickFormatter={(value: number) => value.toLocaleString(locale)}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {showLegend ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {hasGroupTotal ? (
            <Line
              type="monotone"
              dataKey="groupTotal"
              stroke="var(--color-groupTotal)"
              strokeWidth={3}
              dot={false}
            />
          ) : null}
          {seriesKeys.map((seriesKey) => (
            <Line
              key={seriesKey}
              type="monotone"
              dataKey={seriesKey}
              stroke={`var(--color-${seriesKey})`}
              strokeWidth={1.6}
              dot={{ r: 2 }}
            />
          ))}
        </LineChart>
      </ChartContainer>
    );
  }

  const entitlementChartData = chartData as ValueOverTimeDatum[];

  return (
    <SingleSeriesValueAreaChart
      chartConfig={resolvedChartConfig}
      chartData={entitlementChartData}
      dataKey="value"
      gradientId="grad-value-entitlement"
      locale={locale}
    />
  );
}
