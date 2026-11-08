import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { DashboardSummary } from '@/api-client';
import {
  billingHealthQueryOptions,
  useBillingScreenOffered,
} from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import { formatMoney } from '@/lib/money';
import {
  buildCustomersAttention,
  CUSTOMERS_CHECKS,
  quietChecks,
} from '../logic/attention';
import { buildFleet, countStandings } from '../logic/standing';
import { AttentionCard } from './attention-card';
import { BillingCard } from './billing-card';
import { ComingUpCard } from './coming-up-card';
import { type Figure, FiguresRow } from './figures-row';
import { FleetCard } from './fleet-card';
import { LicenseMixCard } from './license-mix-card';
import { RecentChangesCard } from './recent-changes-card';
import { SignalsCards } from './signals-cards';

type CustomersViewProps = {
  summary: DashboardSummary;
  locale: string;
  checkedAt: string;
};

/**
 * The business altitude: customer names, plain sentences, the lever beside each
 * line. Billing figures appear where billing is offered to this session.
 */
export function CustomersView({
  summary,
  locale,
  checkedAt,
}: CustomersViewProps) {
  const { t } = useTranslation();
  const billingOffered = useBillingScreenOffered({ action: 'health.read' });
  const health = useQuery({
    ...billingHealthQueryOptions,
    enabled: billingOffered && summary.billing !== undefined,
  });
  const lines = buildCustomersAttention(
    summary,
    t,
    locale,
    health.data ?? null,
  );
  const fleet = buildFleet(summary);
  const standings = countStandings(fleet);
  const CustomerIcon = dataModelIcons.customer;
  const InstanceIcon = dataModelIcons.instance;
  const LicenseIcon = dataModelIcons.license;
  const EntitlementIcon = dataModelIcons.entitlement;
  const InvoiceIcon = dataModelIcons.invoice;
  const billing = summary.billing;
  const firstCurrency = billing?.invoicedThisMonth[0];

  const figures: Figure[] = [
    {
      id: 'customers',
      label: t('Pages.Dashboard.figures.customers'),
      value: summary.figures.customers.total,
      icon: <CustomerIcon />,
      helpers: [
        t('Pages.Dashboard.figures.newInPeriod', {
          count: summary.figures.customers.createdInRange,
        }),
      ],
    },
    {
      id: 'instances',
      label: t('Pages.Dashboard.figures.instances'),
      value: summary.figures.instances.total,
      unit: t('Pages.Dashboard.figures.active', {
        count: summary.figures.instances.activeInRange,
      }),
      icon: <InstanceIcon />,
      helpers: [
        summary.figures.instances.silentInRange > 0
          ? t('Pages.Dashboard.figures.silent', {
              count: summary.figures.instances.silentInRange,
            })
          : t('Pages.Dashboard.figures.activeDefinition'),
      ],
    },
    {
      id: 'at-limit',
      label: t('Pages.Dashboard.figures.atLimit'),
      value: standings.atLimit,
      icon: <EntitlementIcon />,
      tone: standings.atLimit > 0 ? 'destructive' : undefined,
      helpers: [
        t('Pages.Dashboard.figures.atLimitHelper', {
          count: summary.attention.hardLimits.count,
        }),
        t('Pages.Dashboard.figures.nearLimitHelper', {
          count: summary.attention.nearThreshold.count,
        }),
      ],
    },
    {
      id: 'licenses-ending',
      label: t('Pages.Dashboard.figures.licensesEnding'),
      value: summary.licenses?.ending.within180Days ?? 0,
      unit: t('Pages.Dashboard.figures.licensesEndingHorizon'),
      icon: <LicenseIcon />,
      tone:
        (summary.licenses?.ending.within30Days ?? 0) > 0
          ? 'warning'
          : undefined,
      helpers: [
        t('Pages.Dashboard.figures.licensesEndingHelper', {
          count: summary.licenses?.ending.within30Days ?? 0,
        }),
      ],
    },
  ];
  if (billing && billingOffered) {
    figures.push({
      id: 'invoiced',
      label: t('Pages.Dashboard.figures.invoiced'),
      value: firstCurrency
        ? formatMoney(firstCurrency.currency, firstCurrency.totalMinor)
        : 0,
      icon: <InvoiceIcon />,
      tone: (firstCurrency?.overdue ?? 0) > 0 ? 'destructive' : undefined,
      helpers: [
        firstCurrency
          ? `${t('Pages.Dashboard.figures.invoices', { count: firstCurrency.invoices })} · ${t('Pages.Dashboard.figures.paid', { count: firstCurrency.paid })} · ${t('Pages.Dashboard.figures.overdue', { count: firstCurrency.overdue })}`
          : t('Pages.Dashboard.billing.nothingInvoiced'),
        t('Pages.Dashboard.figures.subscriptions', {
          active: billing.subscriptions.active,
          trial: billing.subscriptions.trial,
          pastDue: billing.subscriptions.pastDue,
        }),
      ],
    });
  } else {
    figures.push({
      id: 'usage-reports',
      label: t('Pages.Dashboard.figures.usageReports'),
      value: summary.figures.usageReports.accepted,
      icon: <EntitlementIcon />,
      tone:
        summary.figures.usageReports.rejected > 0 ? 'destructive' : undefined,
      helpers: [
        t('Pages.Dashboard.figures.refused', {
          count: summary.figures.usageReports.rejected,
        }),
      ],
    });
  }

  return (
    <div className="space-y-4">
      <AttentionCard
        description={t('Pages.Dashboard.attention.customersDescription')}
        lines={lines}
        checked={quietChecks(summary, CUSTOMERS_CHECKS, t, {
          checked: Boolean(health.data),
          quiet: !lines.some((line) => line.id.startsWith('billing-')),
        })}
        checkedAt={checkedAt}
      />
      <FiguresRow figures={figures} />
      <FleetCard rows={fleet} locale={locale} />
      <SignalsCards summary={summary} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {summary.licenses ? (
          <LicenseMixCard mix={summary.licenses.mix} />
        ) : null}
        {summary.licenses ? (
          <ComingUpCard ending={summary.licenses.ending} />
        ) : null}
      </div>
      {billing && billingOffered ? <BillingCard billing={billing} /> : null}
      <RecentChangesCard view="customers" locale={locale} />
    </div>
  );
}
