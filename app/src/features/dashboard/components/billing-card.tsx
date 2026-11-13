import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DashboardBilling } from '@/api-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatMoney } from '@/lib/money';

/** What Kaiten invoiced this month, per currency, and the subscriptions behind it. */
export function BillingCard({ billing }: { billing: DashboardBilling }) {
  const { t } = useTranslation();
  const subs = billing.subscriptions;

  return (
    <Card data-testid="dashboard-billing">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{t('Pages.Dashboard.billing.title')}</CardTitle>
          <CardDescription>
            {t('Pages.Dashboard.billing.description')}
          </CardDescription>
        </div>
        <Link
          to="/invoices"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-subtle-foreground"
        >
          {t('Pages.Dashboard.billing.viewAll')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {billing.invoicedThisMonth.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.billing.nothingInvoiced')}
          </p>
        ) : (
          <ul className="space-y-2">
            {billing.invoicedThisMonth.map((row) => (
              <li
                key={row.currency}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-2xl font-semibold tabular-nums">
                  {t('Pages.Dashboard.billing.invoiced', {
                    amount: formatMoney(row.currency, row.totalMinor),
                  })}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t('Pages.Dashboard.billing.invoices', {
                    count: row.invoices,
                    paid: row.paid,
                    overdue: row.overdue,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {t('Pages.Dashboard.billing.subscriptions')}
          </span>
          {' · '}
          {t('Pages.Dashboard.figures.subscriptions', {
            active: subs.active,
            trial: subs.trial,
            pastDue: subs.pastDue,
          })}
        </p>
      </CardContent>
    </Card>
  );
}
