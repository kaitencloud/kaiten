import { Badge } from '@/components/ui/badge';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import type { UsageStatus } from '../entitlement-usage-status';

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

const BADGES: Record<
  UsageStatus,
  { className?: string; key: string; variant: BadgeVariant }
> = {
  HEALTHY: { key: 'healthy', variant: 'success' },
  // Outlined in the alert colour rather than filled: the grant is doing what
  // it was bought for, which deserves a look, not an alarm.
  IN_ALLOWANCE: {
    className:
      'border-warning-subtle-foreground/40 text-warning-subtle-foreground',
    key: 'inAllowance',
    variant: 'outline',
  },
  NEAR_LIMIT: {
    className: 'text-warning-subtle-foreground',
    key: 'nearLimit',
    variant: 'secondary',
  },
  OVER_LIMIT: { key: 'overLimit', variant: 'destructive' },
  UNBOUNDED: { key: 'unlimited', variant: 'outline' },
  WATCH: { key: 'watch', variant: 'outline' },
};

export function UsageStatusBadge({ status }: { status: UsageStatus }) {
  const { t } = useTranslation();
  const { className, key, variant } = BADGES[status];

  return (
    <Badge variant={variant} className={className}>
      {t(`Features.EntitlementUsage.status.${key}`)}
    </Badge>
  );
}
