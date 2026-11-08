import { useTranslation } from 'react-i18next';
import type { DashboardSummary } from '@/api-client';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  buildIntegrationAttention,
  INTEGRATION_CHECKS,
  quietChecks,
} from '../logic/attention';
import { compactCount } from '../logic/format';
import { AttentionCard } from './attention-card';
import { type Figure, FiguresRow } from './figures-row';
import { FlagEvaluationsCard } from './flag-evaluations-card';
import { IntegrationsCard } from './integrations-card';
import { RecentChangesCard } from './recent-changes-card';
import { UsageReportsCard } from './usage-reports-card';
import { ZonesCard } from './zones-card';

type IntegrationViewProps = {
  summary: DashboardSummary;
  locale: string;
  checkedAt: string;
};

/**
 * The technical altitude: is Kaiten wired and alive. Slugs, counts per day,
 * event names, the identifiers a developer greps for.
 */
export function IntegrationView({
  summary,
  locale,
  checkedAt,
}: IntegrationViewProps) {
  const { t } = useTranslation();
  const lines = buildIntegrationAttention(summary, t, locale);
  const EntitlementIcon = dataModelIcons.entitlement;
  const FlagIcon = dataModelIcons.featureFlag;
  const InstanceIcon = dataModelIcons.instance;
  const TokenIcon = dataModelIcons.token;
  const ZoneIcon = dataModelIcons.deploymentZone;
  const flags = summary.featureFlags;
  const integrations = summary.integrations;
  const behind = summary.attention.zonesBehind.count;

  const figures: Figure[] = [
    {
      id: 'usage-reports',
      label: t('Pages.Dashboard.figures.usageReports'),
      value: compactCount(summary.figures.usageReports.accepted),
      icon: <EntitlementIcon />,
      tone:
        summary.figures.usageReports.rejected > 0 ? 'destructive' : undefined,
      helpers: [
        t('Pages.Dashboard.figures.refused', {
          count: summary.figures.usageReports.rejected,
        }),
      ],
    },
    {
      id: 'flag-evaluations',
      label: t('Pages.Dashboard.figures.flagEvaluations'),
      value: flags ? compactCount(flags.evaluations) : '—',
      icon: <FlagIcon />,
      tone: flags && flags.notEvaluated > 0 ? 'warning' : undefined,
      helpers: flags
        ? [
            t('Pages.Dashboard.figures.flagsEnabled', {
              enabled: flags.enabled,
              total: flags.total,
            }),
            t('Pages.Dashboard.figures.notEvaluated', {
              count: flags.notEvaluated,
            }),
          ]
        : [],
    },
    {
      id: 'instances',
      label: t('Pages.Dashboard.figures.instances'),
      value: summary.figures.instances.total,
      unit: t('Pages.Dashboard.figures.active', {
        count: summary.figures.instances.activeInRange,
      }),
      icon: <InstanceIcon />,
      tone: summary.figures.instances.silentInRange > 0 ? 'warning' : undefined,
      helpers: [
        t('Pages.Dashboard.figures.silent', {
          count: summary.figures.instances.silentInRange,
        }),
        t('Pages.Dashboard.figures.activeDefinition'),
      ],
    },
    {
      id: 'credentials',
      label: t('Pages.Dashboard.figures.credentials'),
      value: integrations ? integrations.activeTokens : '—',
      unit: integrations
        ? t('Pages.Dashboard.figures.keys', {
            count: integrations.publishableKeys,
          })
        : undefined,
      icon: <TokenIcon />,
      tone:
        integrations && integrations.tokensExpiring30Days > 0
          ? 'warning'
          : undefined,
      helpers: integrations
        ? [
            t('Pages.Dashboard.figures.tokensExpiring', {
              count: integrations.tokensExpiring30Days,
            }),
            t('Pages.Dashboard.figures.noExpiry', {
              count: integrations.tokensWithoutExpiry,
            }),
          ]
        : [],
    },
    {
      id: 'zones',
      label: t('Pages.Dashboard.zones.title'),
      value: summary.zones.length,
      icon: <ZoneIcon />,
      tone: behind > 0 ? 'warning' : undefined,
      helpers:
        behind > 0
          ? [t('Pages.Dashboard.zones.behind', { count: behind })]
          : [],
    },
  ];

  return (
    <div className="space-y-4">
      <AttentionCard
        description={t('Pages.Dashboard.attention.integrationDescription')}
        lines={lines}
        checked={quietChecks(summary, INTEGRATION_CHECKS, t)}
        checkedAt={checkedAt}
      />
      <FiguresRow figures={figures} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <UsageReportsCard usage={summary.usageReports} locale={locale} />
        </div>
        <div className="xl:col-span-5">
          {flags ? <FlagEvaluationsCard flags={flags} /> : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ZonesCard zones={summary.zones} locale={locale} />
        {integrations ? (
          <IntegrationsCard integrations={integrations} locale={locale} />
        ) : null}
      </div>
      <RecentChangesCard view="integration" locale={locale} />
    </div>
  );
}
