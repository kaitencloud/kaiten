import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { DashboardLicensesEnding } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { billingStatusKey, instancePath } from '../logic/attention';
import { daysUntil } from '../logic/format';

const STATUS_CLASS: Record<
  ReturnType<typeof billingStatusKey> | 'none',
  string
> = {
  renews: 'bg-success-subtle text-success-subtle-foreground',
  trial: 'bg-info-subtle text-info-subtle-foreground',
  pastDue: 'bg-destructive-subtle text-destructive-subtle-foreground',
  canceled: 'bg-muted text-muted-foreground',
  none: 'bg-warning-subtle text-warning-subtle-foreground',
};

/** The Licenses that end in the next 180 days, the soonest first. */
export function ComingUpCard({ ending }: { ending: DashboardLicensesEnding }) {
  const { t } = useTranslation();
  const more = ending.within180Days - ending.items.length;

  return (
    <Card data-testid="dashboard-coming-up">
      <CardHeader>
        <CardTitle>{t('Pages.Dashboard.comingUp.title')}</CardTitle>
        <CardDescription>
          {t('Pages.Dashboard.comingUp.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {ending.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.comingUp.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {ending.items.map((item) => {
              const key = item.billingStatus
                ? billingStatusKey(item.billingStatus)
                : 'none';
              return (
                <li
                  key={item.instanceSlug}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatDate(item.endsAt)}
                  </span>
                  <div className="min-w-0">
                    <Link
                      to={instancePath(item.instanceSlug)}
                      className="font-medium hover:underline"
                    >
                      {item.customerName}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.licenseName} · {item.instanceName} ·{' '}
                      {t('Pages.Dashboard.comingUp.ends', {
                        when: t('Pages.Dashboard.time.inDays', {
                          count: Math.max(0, daysUntil(item.endsAt)),
                        }),
                      })}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'border-transparent shadow-none',
                      STATUS_CLASS[key],
                    )}
                  >
                    {key === 'none'
                      ? t('Pages.Dashboard.comingUp.noSubscription')
                      : t(`Pages.Dashboard.comingUp.${key}`)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
        {more > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            <Link to="/customers/instances" className="hover:underline">
              {t('Pages.Dashboard.comingUp.more', { count: more })}
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
