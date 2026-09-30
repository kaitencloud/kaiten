import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import type {
  NameType,
  Payload,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent';
import { ChartEmptyState } from '@/components/chart-empty-state';
import { formatDate } from '@/lib/format-date';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { DashboardMetrics } from '../../hooks/use-dashboard-metrics';
import { getInstanceLifecycleTimelineChartConfig } from '../../utils/chart-configs';
import { ChartShell } from './chart-shell';

type InstanceLifecycleTimelineChartProps = {
  data: DashboardMetrics['charts']['instanceLifecycleTimeline'];
};

const toValidDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (/^-?\d+$/.test(normalized)) {
      const numericDate = new Date(Number(normalized));
      if (!Number.isNaN(numericDate.getTime())) {
        return numericDate;
      }
    }

    const parsedDate = new Date(normalized);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return null;
};

const formatAxisDate = (
  value: unknown,
  options: Intl.DateTimeFormatOptions,
) => {
  const date = toValidDate(value);
  if (!date) {
    return typeof value === 'string' ? value : '';
  }

  return formatDate(date, options, '');
};

const getTooltipTimestamp = (
  fallbackLabel: unknown,
  payload?: ReadonlyArray<Payload<ValueType, NameType>>,
) => {
  const timestamp = payload?.[0]?.payload?.timestamp;
  return timestamp ?? fallbackLabel;
};

export const InstanceLifecycleTimelineChart = ({
  data,
}: InstanceLifecycleTimelineChartProps) => {
  const { t } = useTranslation();
  const chartConfig = getInstanceLifecycleTimelineChartConfig(t);

  return (
    <ChartShell
      title={t('Pages.Dashboard.charts.instanceLifecycleTimeline.title')}
      description={t(
        'Pages.Dashboard.charts.instanceLifecycleTimeline.description',
      )}
    >
      {data.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <LineChart
            accessibilityLayer
            data={data}
            margin={{ left: 12, right: 12, top: 8 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) =>
                formatAxisDate(value, { month: 'short', year: 'numeric' })
              }
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value, payload) =>
                    formatAxisDate(getTooltipTimestamp(value, payload), {
                      month: 'short',
                      year: 'numeric',
                    })
                  }
                />
              }
            />
            <Line
              dataKey="created"
              name={t('Pages.Dashboard.chartLabels.created')}
              type="monotone"
              stroke="var(--color-created)"
              strokeWidth={2.2}
              dot={false}
            />
            <Line
              dataKey="started"
              name={t('Pages.Dashboard.chartLabels.started')}
              type="monotone"
              stroke="var(--color-started)"
              strokeWidth={2.2}
              dot={false}
            />
            <Line
              dataKey="ending"
              name={t('Pages.Dashboard.chartLabels.ending')}
              type="monotone"
              stroke="var(--color-ending)"
              strokeWidth={2.2}
              dot={false}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
      )}
    </ChartShell>
  );
};
