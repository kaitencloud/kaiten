import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRelativeTimeToNow } from '@/lib/feed-time';
import { cn } from '@/lib/utils';
import { instancePath } from '../logic/attention';
import { formatQuantity, percentOf } from '../logic/format';
import type { FleetRow } from '../logic/standing';
import { StandingBadge } from './standing-badge';

const ROWS = 8;

type FleetCardProps = {
  rows: FleetRow[];
  locale: string;
};

/**
 * Every instance with where it stands, the ones that need a decision first.
 * The usage column names the meter that decides the standing, with its bar.
 */
export function FleetCard({ rows, locale }: FleetCardProps) {
  const { t } = useTranslation();
  const shown = rows.slice(0, ROWS);
  const more = rows.length - shown.length;

  return (
    <Card data-testid="dashboard-fleet">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{t('Pages.Dashboard.fleet.title')}</CardTitle>
          <CardDescription>
            {t('Pages.Dashboard.fleet.description')}
          </CardDescription>
        </div>
        <Link
          to="/customers/instances"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-subtle-foreground"
        >
          {t('Pages.Dashboard.fleet.viewAll')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.fleet.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Pages.Dashboard.fleet.customer')}</TableHead>
                <TableHead>{t('Pages.Dashboard.fleet.license')}</TableHead>
                <TableHead>{t('Pages.Dashboard.fleet.standing')}</TableHead>
                <TableHead>{t('Pages.Dashboard.fleet.usage')}</TableHead>
                <TableHead>{t('Pages.Dashboard.fleet.lastActivity')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.instanceSlug} data-standing={row.standing}>
                  <TableCell>
                    <Link
                      to={instancePath(row.instanceSlug)}
                      className="font-medium hover:underline"
                    >
                      {row.customerName}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {row.instanceName}
                    </div>
                  </TableCell>
                  <TableCell>{row.reports.licenseName}</TableCell>
                  <TableCell>
                    <StandingBadge standing={row.standing} />
                  </TableCell>
                  <TableCell>
                    <UsageCell row={row} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lastActivity(
                      row,
                      locale,
                      t('Pages.Dashboard.fleet.never'),
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {more > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            <Link to="/customers/instances" className="hover:underline">
              {t('Pages.Dashboard.fleet.more', { count: more })}
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UsageCell({ row }: { row: FleetRow }) {
  const { t } = useTranslation();
  const meter = row.headline;
  if (!meter) {
    return (
      <span className="text-sm text-muted-foreground">
        {row.reports.accepted > 0
          ? t('Pages.Dashboard.fleet.noMeter')
          : t('Pages.Dashboard.fleet.noUsage')}
      </span>
    );
  }
  const percent = percentOf(meter.ratio);
  const max = meter.maxAllowed ?? meter.granted ?? null;
  return (
    <div className="flex items-center gap-2">
      {percent !== null ? (
        <span
          className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
          aria-hidden
        >
          <span
            className={cn(
              'block h-full rounded-full',
              meter.limitReached
                ? 'bg-destructive'
                : meter.aboveWarning
                  ? 'bg-warning'
                  : 'bg-chart-5',
            )}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </span>
      ) : null}
      <span className="text-sm">
        {meter.entitlementName}{' '}
        {max !== null
          ? t('Pages.Dashboard.fleet.of', {
              used: formatQuantity(meter.used),
              max: formatQuantity(max),
            })
          : t('Pages.Dashboard.fleet.unlimited', {
              used: formatQuantity(meter.used),
            })}
      </span>
    </div>
  );
}

function lastActivity(row: FleetRow, locale: string, never: string): string {
  const latest = [row.reports.lastReportAt, row.reports.lastReadAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return latest ? formatRelativeTimeToNow(latest, locale) : never;
}
