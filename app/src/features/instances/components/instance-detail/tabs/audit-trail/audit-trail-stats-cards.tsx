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
import { StatsCardsRow } from '@/functionals/stats-cards-row';
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
    <StatsCardsRow
      columnsClassName="md:grid-cols-3 xl:grid-cols-6"
      items={[
        {
          id: 'audit-total',
          label: t(
            'Pages.Customers.Instances.Detail.auditTrail.stats.totalEvents',
          ),
          value: totalEvents,
          Icon: Activity,
        },
        {
          id: 'audit-read',
          label: t('Pages.Customers.Instances.Detail.auditTrail.stats.read'),
          value: readCount,
          Icon: Eye,
          iconClassName: 'text-primary-subtle-foreground',
          valueClassName: 'text-primary-subtle-foreground',
        },
        {
          id: 'audit-accepted',
          label: t(
            'Pages.Customers.Instances.Detail.auditTrail.stats.accepted',
          ),
          value: acceptedCount,
          Icon: CheckCircle,
          iconClassName: 'text-success-subtle-foreground',
          valueClassName: 'text-success-subtle-foreground',
        },
        {
          id: 'audit-rejected',
          label: t(
            'Pages.Customers.Instances.Detail.auditTrail.stats.rejected',
          ),
          value: rejectedCount,
          Icon: XCircle,
          iconClassName: 'text-destructive-subtle-foreground',
          valueClassName: 'text-destructive-subtle-foreground',
        },
        {
          id: 'audit-warnings',
          label: t(
            'Pages.Customers.Instances.Detail.auditTrail.stats.warnings',
          ),
          value: warningCount,
          Icon: AlertTriangle,
          iconClassName: 'text-warning-subtle-foreground',
          valueClassName: 'text-warning-subtle-foreground',
        },
        {
          id: 'audit-today',
          label: t('Pages.Customers.Instances.Detail.auditTrail.stats.today'),
          value: todayCount,
          Icon: Calendar,
          iconClassName: 'text-primary-subtle-foreground',
        },
      ]}
    />
  );
};
