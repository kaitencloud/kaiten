import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Eye,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AuditTrail } from '@/api-client/types.gen';
import { getEventCategory } from '@/domains/audit-trail';
import { StatCard } from '@/functionals/stat-card';
import { isToday } from './audit-trail.utils';

export const AuditTrailStatsCards = ({
  entries,
}: {
  entries: AuditTrail[];
}) => {
  const { t } = useTranslation();

  const totalEvents = entries.length;
  const readCount = entries.filter(
    (e) => getEventCategory(e.eventName) === 'read',
  ).length;
  const acceptedCount = entries.filter(
    (e) => getEventCategory(e.eventName) === 'accepted',
  ).length;
  const rejectedCount = entries.filter(
    (e) => getEventCategory(e.eventName) === 'rejected',
  ).length;
  const warningCount = entries.filter(
    (e) => getEventCategory(e.eventName) === 'warning',
  ).length;
  const todayCount = entries.filter((e) => isToday(e.timestamp)).length;

  return (
    <StatCard.Row dense columnsClassName="md:grid-cols-3 xl:grid-cols-6">
      <StatCard>
        <StatCard.Label>
          {t('Pages.Customers.Instances.Detail.auditTrail.stats.totalEvents')}
        </StatCard.Label>
        <StatCard.Icon>
          <Activity />
        </StatCard.Icon>
        <StatCard.Value>{totalEvents}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Customers.Instances.Detail.auditTrail.stats.read')}
        </StatCard.Label>
        <StatCard.Icon className="text-primary-subtle-foreground">
          <Eye />
        </StatCard.Icon>
        <StatCard.Value className="text-primary-subtle-foreground">
          {readCount}
        </StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Customers.Instances.Detail.auditTrail.stats.accepted')}
        </StatCard.Label>
        <StatCard.Icon className="text-success-subtle-foreground">
          <CheckCircle />
        </StatCard.Icon>
        <StatCard.Value className="text-success-subtle-foreground">
          {acceptedCount}
        </StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Customers.Instances.Detail.auditTrail.stats.rejected')}
        </StatCard.Label>
        <StatCard.Icon className="text-destructive-subtle-foreground">
          <XCircle />
        </StatCard.Icon>
        <StatCard.Value className="text-destructive-subtle-foreground">
          {rejectedCount}
        </StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Customers.Instances.Detail.auditTrail.stats.warnings')}
        </StatCard.Label>
        <StatCard.Icon className="text-warning-subtle-foreground">
          <AlertTriangle />
        </StatCard.Icon>
        <StatCard.Value className="text-warning-subtle-foreground">
          {warningCount}
        </StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Customers.Instances.Detail.auditTrail.stats.today')}
        </StatCard.Label>
        <StatCard.Icon className="text-primary-subtle-foreground">
          <Calendar />
        </StatCard.Icon>
        <StatCard.Value>{todayCount}</StatCard.Value>
      </StatCard>
    </StatCard.Row>
  );
};
