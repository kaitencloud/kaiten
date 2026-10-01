import { formatDate } from '@/lib/format-date';
import { Badge } from '@/components/ui/badge';
import { Calendar, Percent, Target } from 'lucide-react';
import type {
  BasicTargeting,
  RolloutDateTargeting,
  RolloutPercentageTargeting,
} from '@/api-client';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type TargetingType =
  | BasicTargeting
  | RolloutDateTargeting
  | RolloutPercentageTargeting;

type TargetingDisplayProps = {
  targeting: TargetingType;
};

export function TargetingDisplay({ targeting }: TargetingDisplayProps) {
  const getIcon = () => {
    switch (targeting.type) {
      case 'basic':
        return <Target className="h-3 w-3" />;
      case 'rollout_date':
        return <Calendar className="h-3 w-3" />;
      case 'rollout_percentage':
        return <Percent className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getVariantText = () => {
    if ('variant' in targeting) {
      return targeting.variant;
    }
    if ('distribution' in targeting) {
      return 'Multiple';
    }
    return 'Unknown';
  };

  const getTooltipContent = () => {
    const baseInfo = (
      <>
        <p className="font-semibold">{targeting.name}</p>
        <p className="text-xs">Type: {targeting.type}</p>
        {targeting.rule && (
          <p className="text-xs font-mono break-all">Rule: {targeting.rule}</p>
        )}
      </>
    );

    if (targeting.type === 'basic') {
      return (
        <div className="space-y-1">
          {baseInfo}
          <p className="text-xs">Variant: {targeting.variant}</p>
        </div>
      );
    }

    if (targeting.type === 'rollout_date') {
      return (
        <div className="space-y-1">
          {baseInfo}
          <p className="text-xs">
            Start: {formatDate(targeting.start.date)} (
            {targeting.start.percentage}%)
          </p>
          <p className="text-xs">
            End: {formatDate(targeting.end.date)} ({targeting.end.percentage}%)
          </p>
          <p className="text-xs">Variant: {targeting.start.variant}</p>
        </div>
      );
    }

    if (targeting.type === 'rollout_percentage') {
      return (
        <div className="space-y-1">
          {baseInfo}
          <p className="text-xs">Distribution:</p>
          {Object.entries(targeting.distribution).map(([variant, pct]) => (
            <p key={variant} className="text-xs ml-2">
              {variant}: {String(pct)}%
            </p>
          ))}
        </div>
      );
    }

    return <div className="space-y-1">{baseInfo}</div>;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge variant="secondary" className="cursor-help gap-1">
              {getIcon()}
              <span>{targeting.name}</span>
              <span className="text-xs text-muted-foreground">
                → {getVariantText()}
              </span>
            </Badge>
          }
        />
        <TooltipContent className="max-w-xs">
          {getTooltipContent()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type TargetingsListDisplayProps = {
  targetings: TargetingType[];
};

export function TargetingsListDisplay({
  targetings,
}: TargetingsListDisplayProps) {
  if (!targetings || targetings.length === 0) {
    return <span className="text-sm text-muted-foreground">No targetings</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {targetings.map((targeting) => (
        <TargetingDisplay key={targeting.name} targeting={targeting} />
      ))}
    </div>
  );
}
