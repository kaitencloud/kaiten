import { Badge, type BadgeProps } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  type DefaultLifecycleStage,
  getLifecycleStageLabel,
  isDefaultLifecycleStage,
} from '../logic/instance-lifecycle-stage';

type StageBadgeConfig = {
  className?: string;
  variant: BadgeProps['variant'];
};

// The lifecycle stage is context, not an alert: every stage keeps to an
// outline so the operational status badge beside it stays the only filled one
// on a row. The two stages that call for attention carry their tint on the
// text alone. Any custom value falls back to the same neutral outline (see
// InstanceLifecycleStageBadge).
const STAGE_BADGE_CONFIG: Record<DefaultLifecycleStage, StageBadgeConfig> = {
  TRIAL: { variant: 'outline' },
  ACTIVE: { variant: 'outline' },
  AT_RISK: {
    className:
      'border-warning-subtle-foreground/40 text-warning-subtle-foreground',
    variant: 'outline',
  },
  CHURNED: {
    className:
      'border-destructive-subtle-foreground/40 text-destructive-subtle-foreground',
    variant: 'outline',
  },
};

type InstanceLifecycleStageBadgeProps = {
  className?: string;
  stage?: string | null;
};

export const InstanceLifecycleStageBadge = ({
  className,
  stage,
}: InstanceLifecycleStageBadgeProps) => {
  const { t } = useTranslation();

  if (!stage) {
    return (
      <span className={cn('text-muted-foreground text-xs', className)}>—</span>
    );
  }

  const config: StageBadgeConfig = isDefaultLifecycleStage(stage)
    ? STAGE_BADGE_CONFIG[stage]
    : { variant: 'outline' };

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {getLifecycleStageLabel(t, stage)}
    </Badge>
  );
};
