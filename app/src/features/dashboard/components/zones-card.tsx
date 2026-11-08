import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DashboardZone } from '@/api-client';
import { Badge } from '@/components/ui/badge';
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

/** Each deployment zone with the release it runs, from the deployment journal. */
export function ZonesCard({
  zones,
  locale,
}: {
  zones: DashboardZone[];
  locale: string;
}) {
  const { t } = useTranslation();

  return (
    <Card data-testid="dashboard-zones" className="h-full">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{t('Pages.Dashboard.zones.title')}</CardTitle>
          <CardDescription>
            {t('Pages.Dashboard.zones.description')}
          </CardDescription>
        </div>
        <Link
          to="/releases"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-subtle-foreground"
        >
          {t('Pages.Dashboard.zones.viewAll')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {zones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.zones.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Pages.Dashboard.zones.zone')}</TableHead>
                <TableHead>{t('Pages.Dashboard.zones.release')}</TableHead>
                <TableHead>{t('Pages.Dashboard.zones.deployed')}</TableHead>
                <TableHead className="text-right">
                  {t('Pages.Dashboard.zones.instances')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zones.map((zone) => (
                <TableRow
                  key={zone.slug}
                  data-behind={zone.releasesBehind > 0 || undefined}
                >
                  <TableCell>
                    <div className="font-medium">{zone.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {zone.type}
                    </div>
                  </TableCell>
                  <TableCell>
                    {zone.releaseVersion ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">
                          {zone.releaseVersion}
                        </span>
                        {zone.releasesBehind > 0 ? (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-warning-subtle text-warning-subtle-foreground shadow-none"
                          >
                            {t('Pages.Dashboard.zones.behind', {
                              count: zone.releasesBehind,
                            })}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-success-subtle text-success-subtle-foreground shadow-none"
                          >
                            {t('Pages.Dashboard.zones.latest')}
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t('Pages.Dashboard.zones.nothingDeployed')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {zone.deployedAt ? (
                      <>
                        <div>
                          {formatRelativeTimeToNow(zone.deployedAt, locale)}
                        </div>
                        {zone.deployedBy ? (
                          <div className="text-xs">
                            {t('Pages.Dashboard.zones.by', {
                              who: zone.deployedBy,
                            })}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {zone.instances}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
