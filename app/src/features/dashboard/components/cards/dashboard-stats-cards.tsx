import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '@/functionals/stat-card';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { DashboardMetrics } from '../../hooks/use-dashboard-metrics';

const CustomerIcon = dataModelIcons.customer;
const InstanceIcon = dataModelIcons.instance;
const LicenseIcon = dataModelIcons.license;
const FeatureFlagIcon = dataModelIcons.featureFlag;
const TokenIcon = dataModelIcons.token;

type DashboardStatsCardsProps = {
  summary: DashboardMetrics['summary'];
};

export const DashboardStatsCards = ({ summary }: DashboardStatsCardsProps) => {
  const { t } = useTranslation();
  const expiringTone =
    summary.expiringIn30Days > 0 ? 'text-warning-subtle-foreground' : undefined;
  const tokensTone =
    summary.tokensExpiringSoon > 0
      ? 'text-destructive-subtle-foreground'
      : undefined;

  return (
    // Six figures: three columns up to 2xl, so the labels keep to a line or
    // two instead of three, and the row stays two cards tall at most.
    <StatCard.Row columnsClassName="md:grid-cols-3 xl:grid-cols-6">
      <StatCard>
        <StatCard.Label>{t('Pages.Dashboard.stats.customers')}</StatCard.Label>
        <StatCard.Icon>
          <CustomerIcon />
        </StatCard.Icon>
        <StatCard.Value>{summary.customers}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Dashboard.stats.activeInstances')}
        </StatCard.Label>
        <StatCard.Icon>
          <InstanceIcon />
        </StatCard.Icon>
        <StatCard.Value>{summary.activeInstances}</StatCard.Value>
      </StatCard>
      {/* The two expiry windows are one figure at two horizons: the wider one
          reads as the helper of the nearer one, rather than as a second card
          nested in the instances one. */}
      <StatCard>
        <StatCard.Label>
          {t('Pages.Dashboard.stats.expiringIn30Days')}
        </StatCard.Label>
        <StatCard.Icon className={expiringTone}>
          <AlertTriangle />
        </StatCard.Icon>
        <StatCard.Value className={expiringTone}>
          {summary.expiringIn30Days}
        </StatCard.Value>
        <StatCard.Helper
          className={
            summary.expiringIn60Days > 0
              ? 'text-warning-subtle-foreground'
              : undefined
          }
        >
          {t('Pages.Dashboard.stats.expiringIn60DaysHelper', {
            count: summary.expiringIn60Days,
          })}
        </StatCard.Helper>
      </StatCard>
      <StatCard>
        <StatCard.Label>{t('Pages.Dashboard.stats.licenses')}</StatCard.Label>
        <StatCard.Icon>
          <LicenseIcon />
        </StatCard.Icon>
        <StatCard.Value>{summary.licenses}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Dashboard.stats.featureFlagsEnabled')}
        </StatCard.Label>
        <StatCard.Icon
          className={
            summary.featureFlagsEnabled > 0
              ? 'text-success-subtle-foreground'
              : undefined
          }
        >
          <FeatureFlagIcon />
        </StatCard.Icon>
        <StatCard.Value>
          {summary.featureFlagsEnabled}/{summary.featureFlagsTotal}
        </StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Dashboard.stats.tokensExpiringSoon')}
        </StatCard.Label>
        <StatCard.Icon className={tokensTone}>
          <TokenIcon />
        </StatCard.Icon>
        <StatCard.Value className={tokensTone}>
          {summary.tokensExpiringSoon}
        </StatCard.Value>
        <StatCard.Helper>
          {t('Pages.Dashboard.stats.activeTokens', {
            count: summary.tokensActive,
          })}
        </StatCard.Helper>
      </StatCard>
    </StatCard.Row>
  );
};
