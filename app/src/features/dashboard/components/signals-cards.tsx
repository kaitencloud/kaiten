import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { DashboardSummary } from '@/api-client';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { instanceEntitlementsPath, instancePath } from '../logic/attention';
import { formatQuantity } from '../logic/format';

type Signal = {
  id: string;
  title: string;
  detail: string;
  rule: string;
  to: string;
};

const TOP = 4;
const AT_RISK_STATUSES = ['CANCELED', 'INCOMPLETE', 'PAST_DUE'];

/**
 * The growth and risk signals of the deck's "from signal to revenue": what the
 * figures already say, read as a customer situation with its rule spelled out,
 * before any rule pushes them anywhere.
 */
export function SignalsCards({ summary }: { summary: DashboardSummary }) {
  const { t } = useTranslation();
  const a = summary.attention;

  const growth: Signal[] = [
    ...a.limitsReached.items.map((meter) => ({
      id: `limit-${meter.instanceSlug}-${meter.entitlementSlug}`,
      title: t('Pages.Dashboard.signals.upgrade', {
        customer: meter.customerName,
        entitlement: meter.entitlementName,
        license: meter.licenseName,
      }),
      detail: t('Pages.Dashboard.signals.upgradeDetail', {
        used: formatQuantity(meter.used),
        max: formatQuantity(meter.maxAllowed ?? meter.granted ?? meter.used),
        instance: meter.instanceName,
      }),
      rule: t('Pages.Dashboard.signals.rules.atLimit'),
      to: instanceEntitlementsPath(meter.instanceSlug),
    })),
    ...a.nearThreshold.items.map((meter) => ({
      id: `near-${meter.instanceSlug}-${meter.entitlementSlug}`,
      title: t('Pages.Dashboard.signals.upgrade', {
        customer: meter.customerName,
        entitlement: meter.entitlementName,
        license: meter.licenseName,
      }),
      detail: t('Pages.Dashboard.signals.upgradeDetail', {
        used: formatQuantity(meter.used),
        max: formatQuantity(meter.maxAllowed ?? meter.granted ?? meter.used),
        instance: meter.instanceName,
      }),
      rule: t('Pages.Dashboard.signals.rules.nearLimit'),
      to: instanceEntitlementsPath(meter.instanceSlug),
    })),
    ...summary.licenses.archived.map((item) => ({
      id: `archived-${item.instanceSlug}`,
      title: t('Pages.Dashboard.signals.archived', {
        customer: item.customerName,
        license: item.licenseName,
      }),
      detail: t('Pages.Dashboard.signals.archivedDetail', {
        version: item.version,
        default: item.defaultLicenseName
          ? t('Pages.Dashboard.attention.lines.archived.defaultIs', {
              name: item.defaultLicenseName,
            })
          : t('Pages.Dashboard.attention.lines.archived.noDefault'),
        instance: item.instanceName,
      }),
      rule: t('Pages.Dashboard.signals.rules.archived'),
      to: instancePath(item.instanceSlug),
    })),
  ];

  const risk: Signal[] = [
    // At risk: no subscription, one that ends with its period, or one that is
    // canceled, never completed, or past due.
    ...summary.licenses.ending.items
      .filter(
        (item) =>
          !item.billingStatus ||
          item.cancelAtPeriodEnd ||
          AT_RISK_STATUSES.includes(item.billingStatus),
      )
      .map((item) => ({
        id: `ending-${item.instanceSlug}`,
        title: t('Pages.Dashboard.signals.ending', {
          customer: item.customerName,
          when: formatDate(item.endsAt),
        }),
        detail: t('Pages.Dashboard.signals.endingDetail', {
          license: item.licenseName,
          instance: item.instanceName,
        }),
        rule: t('Pages.Dashboard.signals.rules.ending'),
        to: instancePath(item.instanceSlug),
      })),
    ...a.silentInstances.items.map((item) => ({
      id: `silent-${item.instanceSlug}`,
      title: t('Pages.Dashboard.signals.silent', {
        customer: item.customerName,
        instance: item.instanceName,
      }),
      detail: t('Pages.Dashboard.signals.silentDetail'),
      rule: t('Pages.Dashboard.signals.rules.silent'),
      to: instancePath(item.instanceSlug),
    })),
  ];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <SignalList
        testId="dashboard-growth-signals"
        title={t('Pages.Dashboard.signals.growthTitle')}
        description={t('Pages.Dashboard.signals.growthDescription')}
        signals={growth.slice(0, TOP)}
      />
      <SignalList
        testId="dashboard-risk-signals"
        title={t('Pages.Dashboard.signals.riskTitle')}
        description={t('Pages.Dashboard.signals.riskDescription')}
        signals={risk.slice(0, TOP)}
      />
    </div>
  );
}

function SignalList({
  testId,
  title,
  description,
  signals,
}: {
  testId: string;
  title: string;
  description: string;
  signals: Signal[];
}) {
  const { t } = useTranslation();
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.signals.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {signals.map((signal) => (
              <li
                key={signal.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{signal.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {signal.detail}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {signal.rule}
                  </p>
                </div>
                <Link
                  to={signal.to}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                  )}
                >
                  {t('Pages.Dashboard.signals.open')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
