import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { DashboardUsageReports } from '@/api-client';
import { ChartEmptyState } from '@/components/chart-empty-state';
import { Badge } from '@/components/ui/badge';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ChartShell } from '@/components/ui/chart-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRelativeTimeToNow } from '@/lib/feed-time';
import { formatDateForLocale, formatNumber } from '@/lib/format-date';

const ROWS = 6;

type UsageReportsCardProps = {
  usage: DashboardUsageReports;
  locale: string;
};

/**
 * The integration's pulse: accepted and refused reports per day over the period,
 * then the instances they came from. The one chart of the page: a daily series
 * is the one shape a count has.
 */
export function UsageReportsCard({ usage, locale }: UsageReportsCardProps) {
  const { t } = useTranslation();
  const config = {
    accepted: {
      label: t('Pages.Dashboard.usage.accepted'),
      color: 'var(--chart-1)',
    },
    rejected: {
      label: t('Pages.Dashboard.usage.refused'),
      color: 'var(--destructive)',
    },
  } satisfies ChartConfig;
  const total = usage.perDay.reduce(
    (sum, day) => sum + day.accepted + day.rejected,
    0,
  );
  const data = usage.perDay.map((day) => ({
    day: day.day,
    label: formatDateForLocale(day.day, locale, {
      month: 'short',
      day: 'numeric',
    }),
    accepted: day.accepted,
    rejected: day.rejected,
  }));
  const shown = usage.byInstance.slice(0, ROWS);
  const more = usage.byInstance.length - shown.length;

  return (
    <ChartShell
      title={t('Pages.Dashboard.usage.title')}
      description={t('Pages.Dashboard.usage.description')}
      contentClassName="space-y-4"
    >
      {total === 0 ? (
        <ChartEmptyState message={t('Pages.Dashboard.usage.empty')} />
      ) : (
        <ChartContainer
          config={config}
          className="aspect-auto h-[220px] w-full"
        >
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ left: 0, right: 8, top: 8 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={32}
              tickFormatter={(value: number) => formatNumber(value)}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="accepted"
              stackId="reports"
              fill="var(--color-accepted)"
              radius={[0, 0, 2, 2]}
            />
            <Bar
              dataKey="rejected"
              stackId="reports"
              fill="var(--color-rejected)"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      )}
      {usage.byInstance.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Pages.Dashboard.usage.byInstance')}</TableHead>
              <TableHead className="text-right">
                {t('Pages.Dashboard.usage.accepted')}
              </TableHead>
              <TableHead className="text-right">
                {t('Pages.Dashboard.usage.refused')}
              </TableHead>
              <TableHead className="text-right">
                {t('Pages.Dashboard.usage.lastReport')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row) => (
              <TableRow
                key={row.instanceSlug}
                data-silent={row.silent || undefined}
              >
                <TableCell>
                  <span className="font-mono text-xs">{row.instanceSlug}</span>
                  {row.silent ? (
                    <Badge
                      variant="outline"
                      className="ml-2 border-transparent bg-warning-subtle text-warning-subtle-foreground shadow-none"
                    >
                      {t('Pages.Dashboard.usage.silent')}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.accepted)}
                </TableCell>
                <TableCell
                  className={
                    row.rejected > 0
                      ? 'text-right font-semibold tabular-nums text-destructive-subtle-foreground'
                      : 'text-right tabular-nums text-muted-foreground'
                  }
                >
                  {formatNumber(row.rejected)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {row.lastReportAt
                    ? formatRelativeTimeToNow(row.lastReportAt, locale)
                    : t('Pages.Dashboard.usage.never')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {more > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('Pages.Dashboard.usage.more', { count: more })}
        </p>
      ) : null}
    </ChartShell>
  );
}
