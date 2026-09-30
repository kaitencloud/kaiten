import type { Variant } from '@/api-client';
import type { RolloutDateConfigValue } from '../../../rollout';

export type BasicVariant = {
  type: 'basic';
  value: string;
};

export type RolloutDate = {
  type: 'rollout_date';
  start: RolloutDateConfigValue;
  end: RolloutDateConfigValue;
};

export type RolloutPercentage = {
  type: 'rollout_percentage';
  distribution: Record<string, number>;
};

export type DefaultVariantValue =
  | BasicVariant
  | RolloutDate
  | RolloutPercentage;

export type DefaultVariantConfigProps = {
  value: DefaultVariantValue;
  variants: Variant[];
  onChange: (value: DefaultVariantValue) => void;
  fallbackValue: unknown | undefined;
  onFallbackChange: (value: unknown | undefined) => void;
};
