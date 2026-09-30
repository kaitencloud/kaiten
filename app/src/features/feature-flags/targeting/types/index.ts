import type {
  BasicTargeting,
  RolloutDateTargeting,
  RolloutPercentageTargeting,
  Variant,
} from '@/api-client';

// Union type for all targeting types
export type Targeting =
  | BasicTargeting
  | RolloutDateTargeting
  | RolloutPercentageTargeting;

// Type guards
export function isBasicTargeting(
  targeting: Targeting,
): targeting is BasicTargeting {
  return targeting.type === 'basic';
}

export function isRolloutDateTargeting(
  targeting: Targeting,
): targeting is RolloutDateTargeting {
  return targeting.type === 'rollout_date';
}

export function isRolloutPercentageTargeting(
  targeting: Targeting,
): targeting is RolloutPercentageTargeting {
  return targeting.type === 'rollout_percentage';
}

// Form values for each targeting type
export type BasicTargetingFormValues = {
  type: 'basic';
  name: string;
  rule: string;
  variant: string;
};

export type RolloutDateTargetingFormValues = {
  type: 'rollout_date';
  name: string;
  rule: string;
  start: {
    date: string;
    percentage: number | string;
    variant: string;
  };
  end: {
    date: string;
    percentage: number | string;
    variant: string;
  };
};

export type RolloutPercentageTargetingFormValues = {
  type: 'rollout_percentage';
  name: string;
  rule: string;
  distribution: Record<string, number>;
};

export type TargetingFormValues =
  | BasicTargetingFormValues
  | RolloutDateTargetingFormValues
  | RolloutPercentageTargetingFormValues;

// Props for components
export type TargetingListProps = {
  targetings: Targeting[];
  variants: Variant[];
  onChange: (targetings: Targeting[]) => void;
  disabled?: boolean;
  disableCelValidation?: boolean;
};

export type TargetingFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variants: Variant[];
  onSubmit: (targeting: Targeting) => void;
  targeting?: Targeting;
  mode?: 'create' | 'edit';
  disableCelValidation?: boolean;
};
