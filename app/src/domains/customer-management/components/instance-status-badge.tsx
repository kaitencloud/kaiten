import { Badge, type BadgeProps } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  getInstanceStatusLabel,
  resolveInstanceStatus,
  type InstanceStatus,
} from '../logic/instance-status';

type StatusBadgeConfig = {
  className?: string;
  variant: BadgeProps['variant'];
};

const STATUS_BADGE_CONFIG: Record<InstanceStatus, StatusBadgeConfig> = {
  HEALTHY: { variant: 'success' },
  DEGRADED: {
    className:
      'border-transparent bg-warning-subtle text-warning-subtle-foreground',
    variant: 'secondary',
  },
  INCIDENT: { variant: 'destructive' },
  MAINTENANCE: {
    className:
      'border-info-subtle-foreground/30 bg-info-subtle text-info-subtle-foreground',
    variant: 'outline',
  },
};

type InstanceStatusBadgeProps = {
  className?: string;
  status?: InstanceStatus;
};

export const InstanceStatusBadge = ({
  className,
  status,
}: InstanceStatusBadgeProps) => {
  const { t } = useTranslation();
  const resolvedStatus = resolveInstanceStatus(status);
  const config = STATUS_BADGE_CONFIG[resolvedStatus];

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {getInstanceStatusLabel(t, resolvedStatus)}
    </Badge>
  );
};
