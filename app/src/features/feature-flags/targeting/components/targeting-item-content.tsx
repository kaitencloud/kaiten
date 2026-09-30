import { formatDateTime } from '@/lib/format-date';
import { Badge } from '@/components/ui/badge';
import { Calendar, Percent, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CelRuleHighlight } from '@/functionals/cel-editor';
import {
  isBasicTargeting,
  isRolloutDateTargeting,
  isRolloutPercentageTargeting,
  type Targeting,
} from '../types';
import { DistributionBar } from './distribution-bar';

type TargetingItemHeaderProps = {
  targeting: Targeting;
};

export function TargetingItemHeader({ targeting }: TargetingItemHeaderProps) {
  const { t } = useTranslation();

  const getIcon = () => {
    if (isBasicTargeting(targeting)) {
      return <Target className="h-4 w-4" />;
    }
    if (isRolloutDateTargeting(targeting)) {
      return <Calendar className="h-4 w-4" />;
    }
    if (isRolloutPercentageTargeting(targeting)) {
      return <Percent className="h-4 w-4" />;
    }
    return null;
  };

  const getTypeLabel = () => {
    if (isBasicTargeting(targeting)) {
      return t('Features.Targeting.Types.basic');
    }
    if (isRolloutDateTargeting(targeting)) {
      return t('Features.Targeting.Types.rolloutDate');
    }
    if (isRolloutPercentageTargeting(targeting)) {
      return t('Features.Targeting.Types.rolloutPercentage');
    }
    return (targeting as Targeting).type;
  };

  return (
    <Badge variant="outline" className="gap-1.5 py-1 pl-1 pr-2.5 font-medium">
      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground">
        {getIcon()}
      </div>
      {getTypeLabel()}
    </Badge>
  );
}

type TargetingItemContentProps = {
  targeting: Targeting;
};

export function TargetingItemContent({ targeting }: TargetingItemContentProps) {
  const { t } = useTranslation();

  return (
    <div className="text-sm space-y-2">
      <div>
        <span className="text-muted-foreground">
          {t('Features.Targeting.rule')}:
        </span>
        <CelRuleHighlight
          value={targeting.rule}
          className="bg-muted ml-2 rounded px-2 py-1 text-xs"
        />
      </div>

      {isBasicTargeting(targeting) && (
        <div>
          <span className="text-muted-foreground">
            {t('Features.Targeting.variant')}:
          </span>
          <Badge variant="secondary" className="ml-2">
            {targeting.variant}
          </Badge>
        </div>
      )}

      {isRolloutDateTargeting(targeting) && (
        <div className="space-y-1">
          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
            <span className="text-muted-foreground">
              {t('Features.Targeting.RolloutDateForm.startConfiguration')}:
            </span>
            <span className="text-xs flex items-center gap-2">
              {formatDateTime(targeting.start.date)} -{' '}
              {targeting.start.percentage}% -{' '}
              <Badge variant="secondary">{targeting.start.variant}</Badge>
            </span>
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
            <span className="text-muted-foreground">
              {t('Features.Targeting.RolloutDateForm.endConfiguration')}:
            </span>
            <span className="text-xs flex items-center gap-2">
              {formatDateTime(targeting.end.date)} - {targeting.end.percentage}%
              - <Badge variant="secondary">{targeting.end.variant}</Badge>
            </span>
          </div>
        </div>
      )}

      {isRolloutPercentageTargeting(targeting) && (
        <div>
          <span className="text-muted-foreground mb-2 block">
            {t('Features.Targeting.RolloutPercentageForm.distribution')}:
          </span>
          <DistributionBar distribution={targeting.distribution} />
        </div>
      )}
    </div>
  );
}
