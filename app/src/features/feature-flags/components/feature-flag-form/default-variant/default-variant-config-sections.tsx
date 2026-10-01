import { Input } from '@/components/ui/input';
import type { TFunction } from 'i18next';
import type { Variant } from '@/api-client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DefaultVariantType } from '../../../store';
import { stringifyFallbackValue } from './default-variant-config-utils';
import { VariantSelector } from './default-variant-config-variant-selector';

type TranslateFn = TFunction;

type FallbackSectionProps = {
  fallbackValue: unknown;
  fallbackVariantName: string;
  onFallbackValueChange: (rawValue: string) => void;
  onVariantChange: (variantName: string) => void;
  t: TranslateFn;
  variants: Variant[];
};

export function FallbackSection({
  fallbackValue,
  fallbackVariantName,
  onFallbackValueChange,
  onVariantChange,
  t,
  variants,
}: FallbackSectionProps) {
  return (
    <div className="space-y-3">
      <VariantSelector
        disabled={variants.length === 0}
        label={t(
          'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.fallbackVariantLabel',
        )}
        onValueChange={onVariantChange}
        placeholder={t('Features.Targeting.BasicForm.variantPlaceholder')}
        value={fallbackVariantName}
        variants={variants}
      />

      <div className="space-y-1">
        <label className="text-sm font-medium">
          {t(
            'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.fallbackValueLabel',
          )}
        </label>
        <p className="text-xs text-muted-foreground">
          {t(
            'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.fallbackValueDescription',
          )}
        </p>
        <Input
          type="text"
          value={stringifyFallbackValue(fallbackValue)}
          onChange={(event) => onFallbackValueChange(event.target.value)}
        />
      </div>
    </div>
  );
}

type DefaultVariantTypeSelectorProps = {
  onTypeChange: (newType: DefaultVariantType) => void;
  t: TranslateFn;
  type: DefaultVariantType;
};

export function DefaultVariantTypeSelector({
  onTypeChange,
  t,
  type,
}: DefaultVariantTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {t('Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.typeLabel')}
      </label>
      <Select
        items={['basic', 'rollout_date', 'rollout_percentage'].map((value) => ({
          value,
          label: t(
            `Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.Types.${value === 'basic' ? 'simple' : value === 'rollout_date' ? 'rolloutDate' : 'rolloutPercentage'}`,
          ),
        }))}
        value={type}
        onValueChange={(value) => onTypeChange(value as DefaultVariantType)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="basic">
            {t(
              'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.Types.simple',
            )}
          </SelectItem>
          <SelectItem value="rollout_date">
            {t(
              'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.Types.rolloutDate',
            )}
          </SelectItem>
          <SelectItem value="rollout_percentage">
            {t(
              'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.Types.rolloutPercentage',
            )}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

type BasicVariantSelectorProps = {
  onValueChange: (newValue: string) => void;
  t: TranslateFn;
  value: string;
  variants: Variant[];
};

export function BasicVariantSelector({
  onValueChange,
  t,
  value,
  variants,
}: BasicVariantSelectorProps) {
  return (
    <VariantSelector
      disabled={variants.length === 0}
      label={t(
        'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.variantLabel',
      )}
      onValueChange={onValueChange}
      placeholder={t('Features.Targeting.BasicForm.variantPlaceholder')}
      value={value}
      variants={variants}
    />
  );
}

type DefaultVariantCodegenToggleProps = {
  ariaLabel: string;
  codegenEnabled: boolean;
  onToggle: () => void;
};

export function DefaultVariantCodegenToggle({
  ariaLabel,
  codegenEnabled,
  onToggle,
}: DefaultVariantCodegenToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={codegenEnabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        codegenEnabled ? 'bg-primary' : 'bg-input'
      }`}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
          codegenEnabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
