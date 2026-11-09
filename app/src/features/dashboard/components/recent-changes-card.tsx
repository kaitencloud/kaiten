import { useQuery } from '@tanstack/react-query';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  type GlobalAuditEntry,
  globalAuditTrailQueryOptions,
  resolveEventLabel,
} from '@/domains/audit-trail';
import { formatRelativeTimeToNow } from '@/lib/feed-time';
import type { DashboardView } from '../search';

const ROWS = 6;
const FEED_LIMIT = 100;

// The commercial trail: customers, Licenses, grants, exceptions, vouchers,
// subscriptions and invoices. Everything else is the technical one.
const COMMERCIAL_HINTS = [
  'CUSTOMER_',
  'LICENSE',
  'ENTITLEMENT_EXCEPTION',
  'VOUCHER',
  'BILLING',
  'INVOICE',
  'SUBSCRIPTION',
  'CHECKOUT',
  'PAYMENT',
  'ADDON',
  'TRIAL',
];

export function isCommercialEvent(eventName: string): boolean {
  return COMMERCIAL_HINTS.some((hint) => eventName.includes(hint));
}

export function selectRecentChanges(
  entries: GlobalAuditEntry[],
  view: DashboardView,
): GlobalAuditEntry[] {
  return entries
    .filter((entry) =>
      view === 'customers'
        ? isCommercialEvent(entry.eventName)
        : !isCommercialEvent(entry.eventName),
    )
    .slice(0, ROWS);
}

type RecentChangesCardProps = {
  view: DashboardView;
  locale: string;
};

/**
 * The last changes of the audit trail that belong to the view, read without
 * suspending: the page draws with or without them.
 */
export function RecentChangesCard({ view, locale }: RecentChangesCardProps) {
  const { t } = useTranslation();
  const feed = useQuery(globalAuditTrailQueryOptions(FEED_LIMIT, true));
  const entries = feed.data ? selectRecentChanges(feed.data, view) : [];

  return (
    <Card data-testid="dashboard-recent-changes">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{t('Pages.Dashboard.changes.title')}</CardTitle>
          <CardDescription>
            {view === 'customers'
              ? t('Pages.Dashboard.changes.customersDescription')
              : t('Pages.Dashboard.changes.integrationDescription')}
          </CardDescription>
        </div>
        <Link
          to="/audit-trail"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-subtle-foreground"
        >
          {t('Pages.Dashboard.changes.viewAll')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {feed.isPending ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-11/12" />
            <Skeleton className="h-5 w-10/12" />
          </div>
        ) : feed.isError ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.changes.unavailable')}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.changes.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="grid grid-cols-[8rem_10rem_minmax(0,1fr)] items-baseline gap-4 py-2 text-sm first:pt-0 last:pb-0"
              >
                <span className="tabular-nums text-muted-foreground">
                  {formatRelativeTimeToNow(entry.timestamp, locale)}
                </span>
                <span className="truncate font-medium">
                  {entry.actor?.name ?? t('Pages.Dashboard.changes.system')}
                </span>
                <span className="min-w-0 truncate">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">
                    {resolveEventLabel(entry.eventName, t)}
                  </span>
                  {[entry.customerName, entry.instanceName]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
