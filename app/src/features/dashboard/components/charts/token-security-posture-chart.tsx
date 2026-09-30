import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart } from 'recharts';
import { ChartEmptyState } from '@/components/chart-empty-state';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { DashboardMetrics } from '../../hooks/use-dashboard-metrics';
import { getTokenSecurityPostureChartConfig } from '../../utils/chart-configs';
import { ChartShell } from './chart-shell';

type TokenSecurityPostureChartProps = {
  data: DashboardMetrics['charts']['tokenSecurityPosture'];
};

function renderTokenCell(
  entry: DashboardMetrics['charts']['tokenSecurityPosture'][number],
) {
  return <Cell key={entry.stateKey} fill={entry.fill} />;
}

export const TokenSecurityPostureChart = ({
  data,
}: TokenSecurityPostureChartProps) => {
  const { t } = useTranslation();
  const chartConfig = getTokenSecurityPostureChartConfig(t);
  // A full disc says "100 %" and nothing else; the sentence says which state.
  const singleState = data.length === 1 ? data[0] : null;

  return (
    <ChartShell
      title={t('Pages.Dashboard.charts.tokenSecurityPosture.title')}
      description={t('Pages.Dashboard.charts.tokenSecurityPosture.description')}
    >
      {data.length === 0 ? (
        <ChartEmptyState
          message={t('Pages.Dashboard.charts.tokenSecurityPosture.emptyState')}
        />
      ) : singleState ? (
        <ChartEmptyState
          message={t(
            'Pages.Dashboard.charts.tokenSecurityPosture.singleState',
            {
              count: singleState.tokens,
              state: t(
                `Pages.Dashboard.chartLabels.${singleState.stateKey}`,
              ).toLowerCase(),
            },
          )}
        />
      ) : (
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[280px] w-full"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel nameKey="stateKey" />}
            />
            <Pie
              data={data}
              dataKey="tokens"
              nameKey="stateKey"
              stroke="transparent"
            >
              {data.map(renderTokenCell)}
            </Pie>
            <ChartLegend
              content={
                <ChartLegendContent
                  nameKey="stateKey"
                  className="-translate-y-2 flex-wrap gap-2 *:basis-1/2 *:justify-center"
                />
              }
            />
          </PieChart>
        </ChartContainer>
      )}
    </ChartShell>
  );
};
