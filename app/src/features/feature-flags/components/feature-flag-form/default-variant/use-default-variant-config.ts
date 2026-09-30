import { useEffect } from 'react';
import type { Variant } from '@/api-client';
import type { RolloutDateConfigValue } from '../../../rollout';
import { useDefaultVariantConfigStore } from '../../../hooks/use-default-variant-config-store';
import type { DefaultVariantType } from '../../../store';
import type { DefaultVariantValue } from './default-variant-config.types';
import {
  createDefaultVariantValue,
  findFallbackVariantName,
  parseJsonInput,
} from './default-variant-config-utils';

type UseDefaultVariantConfigOptions = {
  fallbackValue: unknown | undefined;
  onChange: (value: DefaultVariantValue) => void;
  onFallbackChange: (value: unknown | undefined) => void;
  value: DefaultVariantValue;
  variants: Variant[];
};

function getCurrentType(value: DefaultVariantValue): DefaultVariantType {
  return value.type ?? 'basic';
}

function getRolloutDateValue(value: DefaultVariantValue) {
  return value.type === 'rollout_date' ? value : null;
}

export function useDefaultVariantConfig({
  fallbackValue,
  onChange,
  onFallbackChange,
  value,
  variants,
}: UseDefaultVariantConfigOptions) {
  const {
    fallbackVariantName,
    hasInitialized,
    type,
    markInitialized,
    setFallbackVariantName,
    setType,
  } = useDefaultVariantConfigStore(
    getCurrentType(value),
    findFallbackVariantName(variants, fallbackValue),
  );
  const codegenEnabled = fallbackValue !== undefined;
  const rolloutDateValue = getRolloutDateValue(value);

  useEffect(() => {
    if (
      hasInitialized ||
      fallbackValue !== undefined ||
      variants.length === 0
    ) {
      return;
    }

    markInitialized();
    const source =
      value.type === 'basic'
        ? (variants.find((variant) => variant.name === value.value) ??
          variants[0])
        : variants[0];
    setFallbackVariantName(source.name);
    onFallbackChange(source.value);
  }, [
    fallbackValue,
    hasInitialized,
    markInitialized,
    onFallbackChange,
    setFallbackVariantName,
    value,
    variants,
  ]);

  const handleTypeChange = (newType: DefaultVariantType) => {
    const firstVariant = variants.length > 0 ? variants[0] : null;

    setType(newType);
    onChange(createDefaultVariantValue(newType, firstVariant));

    if (codegenEnabled && firstVariant) {
      setFallbackVariantName(firstVariant.name);
      onFallbackChange(firstVariant.value);
    }
  };

  const handleBasicVariantChange = (newValue: string) => {
    const selected = variants.find((variant) => variant.name === newValue);

    onChange({ type: 'basic', value: newValue });
    if (codegenEnabled) {
      setFallbackVariantName(newValue);
      onFallbackChange(selected ? selected.value : newValue);
    }
  };

  const handleRolloutDateChange = (nextValue: {
    end: RolloutDateConfigValue;
    start: RolloutDateConfigValue;
  }) => {
    onChange({ type: 'rollout_date', ...nextValue });
  };

  const handleRolloutPercentageChange = (
    distribution: Record<string, number>,
  ) => {
    onChange({ type: 'rollout_percentage', distribution });
  };

  const handleToggleCodegen = () => {
    if (codegenEnabled) {
      setFallbackVariantName('');
      onFallbackChange(undefined);
      return;
    }

    if (value.type === 'basic') {
      const selected = variants.find((variant) => variant.name === value.value);
      setFallbackVariantName(selected?.name ?? '');
      onFallbackChange(selected ? selected.value : '');
      return;
    }

    const firstVariant = variants[0];
    setFallbackVariantName(firstVariant?.name ?? '');
    onFallbackChange(firstVariant ? firstVariant.value : '');
  };

  const handleFallbackVariantChange = (variantName: string) => {
    const selected = variants.find((variant) => variant.name === variantName);
    setFallbackVariantName(variantName);
    onFallbackChange(selected ? selected.value : '');
  };

  const handleFallbackValueChange = (rawValue: string) => {
    const parsed = parseJsonInput(rawValue);
    setFallbackVariantName(findFallbackVariantName(variants, parsed));
    onFallbackChange(parsed);
  };

  return {
    codegenEnabled,
    fallbackVariantName,
    handleBasicVariantChange,
    handleFallbackValueChange,
    handleFallbackVariantChange,
    handleRolloutDateChange,
    handleRolloutPercentageChange,
    handleToggleCodegen,
    handleTypeChange,
    rolloutDateValue,
    type,
  };
}
