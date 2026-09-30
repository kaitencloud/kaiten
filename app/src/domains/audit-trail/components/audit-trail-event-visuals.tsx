import { Badge } from '@/components/ui/badge';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  type LucideIcon,
  XCircle,
} from 'lucide-react';
import type { AuditEventCategory } from '../audit-trail.types';
import { getEventCategory } from '../audit-trail.utils';

interface EventIcon {
  Icon: LucideIcon;
  iconText: string;
  tint: string;
}

export const getEventIcon = (category: AuditEventCategory): EventIcon => {
  if (category === 'rejected') {
    return {
      Icon: XCircle,
      iconText: 'text-destructive-subtle-foreground',
      tint: 'bg-destructive-subtle',
    };
  }
  if (category === 'warning') {
    return {
      Icon: AlertTriangle,
      iconText: 'text-warning-subtle-foreground',
      tint: 'bg-warning-subtle',
    };
  }
  if (category === 'accepted') {
    return {
      Icon: CheckCircle,
      iconText: 'text-success-subtle-foreground',
      tint: 'bg-success-subtle',
    };
  }
  return {
    Icon: Eye,
    iconText: 'text-primary-subtle-foreground',
    tint: 'bg-primary/10',
  };
};

export function AuditStatusBadge({
  eventName,
  t,
}: {
  eventName: string;
  t: TFunction;
}) {
  const category = getEventCategory(eventName);

  if (category === 'accepted') {
    return (
      <Badge variant="success">
        {t('Pages.AuditTrail.table.filters.accepted')}
      </Badge>
    );
  }
  if (category === 'rejected') {
    return (
      <Badge variant="destructive">
        {t('Pages.AuditTrail.table.filters.rejected')}
      </Badge>
    );
  }
  if (category === 'warning') {
    return (
      <Badge
        variant="outline"
        className="border-warning-subtle-foreground/30 bg-warning-subtle text-warning-subtle-foreground"
      >
        {t('Pages.AuditTrail.table.filters.warning')}
      </Badge>
    );
  }
  return (
    <Badge variant="outline">{t('Pages.AuditTrail.table.filters.read')}</Badge>
  );
}
