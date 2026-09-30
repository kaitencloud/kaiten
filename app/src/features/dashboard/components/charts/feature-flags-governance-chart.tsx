import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Rectangle,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartEmptyState } from '@/components/chart-empty-state';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { DashboardMetrics } from '../../hooks/use-dashboard-metrics';
import { getFeatureFlagsGovernanceChartConfig } from '../../utils/chart-configs';
import { VERTICAL_BAR_TOP_RADIUS } from './bar-radius-utils';
import { ChartShell } from './chart-shell';

type FeatureFlagsGovernanceChartProps = {
  data: DashboardMetrics['charts']['featureFlagsGovernance'];
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

function renderEnabledDisabledCell(
  entry: DashboardMetrics['charts']['featureFlagsGovernance']['enabledDisabled'][number],
) {
  return <Cell key={entry.stateKey} fill={entry.fill} />;
}

function renderTypeDistributionCell(
  entry: DashboardMetrics['charts']['featureFlagsGovernance']['typeDistribution'][number],
) {
  return <Cell key={entry.flagType} fill={entry.fill} />;
}

export const FeatureFlagsGovernanceChart = ({
  data,
}: FeatureFlagsGovernanceChartProps) => {
  const { t } = useTranslation();
  const chartConfig = getFeatureFlagsGovernanceChartConfig(t);

  const hasData =
    data.enabledDisabled.some((entry) => entry.count > 0) ||
    data.typeDistribution.some((entry) => entry.count > 0);

  function formatFlagType(flagType: string) {
    return t(`Pages.FeatureFlags.Types.${flagType.toLowerCase()}`, {
      defaultValue: flagType,
    });
  }

  const enabledCount =
    data.enabledDisabled.find((entry) => entry.stateKey === 'enabled')?.count ??
    0;
  const disabledCount =
    data.enabledDisabled.find((entry) => entry.stateKey === 'disabled')
      ?.count ?? 0;
  const flagsTotal = enabledCount + disabledCount;

  // A pie with a single slice says nothing a sentence does not say better.
  function renderEnabledDisabled() {
    if (flagsTotal > 0 && (enabledCount === 0 || disabledCount === 0)) {
      return (
        <ChartEmptyState
          message={t(
            enabledCount > 0
              ? 'Pages.Dashboard.charts.featureFlagsGovernance.allEnabled'
              : 'Pages.Dashboard.charts.featureFlagsGovernance.allDisabled',
            { count: flagsTotal },
          )}
        />
      );
    }

    return (
      <ChartContainer config={chartConfig} className="h-[260px] w-full">
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel nameKey="stateKey" />}
          />
          <Pie data={data.enabledDisabled} dataKey="count" nameKey="stateKey">
            {data.enabledDisabled.map(renderEnabledDisabledCell)}
          </Pie>
          <ChartLegend
            content={<ChartLegendContent nameKey="stateKey" />}
            verticalAlign="bottom"
          />
        </PieChart>
      </ChartContainer>
    );
  }

  return (
    <ChartShell
      title={t('Pages.Dashboard.charts.featureFlagsGovernance.title')}
      description={t(
        'Pages.Dashboard.charts.featureFlagsGovernance.description',
      )}
      contentClassName="pt-0"
    >
      {!hasData ? (
        <ChartEmptyState
          message={t(
            'Pages.Dashboard.charts.featureFlagsGovernance.emptyState',
          )}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderEnabledDisabled()}

          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <BarChart
              accessibilityLayer
              data={data.typeDistribution}
              margin={{ left: 8, right: 8, top: 12 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="flagType"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={formatFlagType}
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
                {data.typeDistribution.map(renderTypeDistributionCell)}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </ChartShell>
  );
};
