import {
  AlertTriangle,
  Flag,
  KeyRound,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatsCardsRow } from '@/functionals/stats-cards-row';
import type { DashboardMetrics } from '../../hooks/use-dashboard-metrics';

type DashboardStatsCardsProps = {
  summary: DashboardMetrics['summary'];
};

export const DashboardStatsCards = ({ summary }: DashboardStatsCardsProps) => {
  const { t } = useTranslation();

  return (
    // Six figures: three columns up to 2xl, so the labels keep to a line or
    // two instead of three, and the row stays two cards tall at most.
    <StatsCardsRow
      className="lg:gap-4"
      columnsClassName="md:grid-cols-3 xl:grid-cols-6"
      items={[
        {
          id: 'customers',
          label: t('Pages.Dashboard.stats.customers'),
          value: summary.customers,
          Icon: Users,
        },
        {
          id: 'active-instances',
          label: t('Pages.Dashboard.stats.activeInstances'),
          value: summary.activeInstances,
          Icon: Server,
        },
        {
          // The two expiry windows are one figure at two horizons: the wider
          // one reads as the helper of the nearer one, rather than as a second
          // card nested in the instances one.
          id: 'expiring-30-days',
          label: t('Pages.Dashboard.stats.expiringIn30Days'),
          value: summary.expiringIn30Days,
          helper: t('Pages.Dashboard.stats.expiringIn60DaysHelper', {
            count: summary.expiringIn60Days,
          }),
          helperClassName:
            summary.expiringIn60Days > 0
              ? 'text-warning-subtle-foreground'
              : undefined,
          Icon: AlertTriangle,
          iconClassName:
            summary.expiringIn30Days > 0
              ? 'text-warning-subtle-foreground'
              : 'text-muted-foreground',
          valueClassName:
            summary.expiringIn30Days > 0
              ? 'text-warning-subtle-foreground'
              : undefined,
        },
        {
          id: 'licenses',
          label: t('Pages.Dashboard.stats.licenses'),
          value: summary.licenses,
          Icon: ShieldCheck,
        },
        {
          id: 'feature-flags',
          label: t('Pages.Dashboard.stats.featureFlagsEnabled'),
          value: `${summary.featureFlagsEnabled}/${summary.featureFlagsTotal}`,
          Icon: Flag,
          iconClassName:
            summary.featureFlagsEnabled > 0
              ? 'text-success-subtle-foreground'
              : undefined,
        },
        {
          id: 'token-risk',
          label: t('Pages.Dashboard.stats.tokensExpiringSoon'),
          value: summary.tokensExpiringSoon,
          helper: t('Pages.Dashboard.stats.activeTokens', {
            count: summary.tokensActive,
          }),
          Icon: KeyRound,
          iconClassName:
            summary.tokensExpiringSoon > 0
              ? 'text-destructive-subtle-foreground'
              : 'text-muted-foreground',
          valueClassName:
            summary.tokensExpiringSoon > 0
              ? 'text-destructive-subtle-foreground'
              : undefined,
        },
      ]}
    />
  );
};
