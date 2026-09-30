import type { Variant } from '@/api-client';
import type { DefaultVariantType } from '../../../store';
import type { DefaultVariantValue } from './default-variant-config.types';

export function parseJsonInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function stringifyFallbackValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

export function findFallbackVariantName(
  variants: Variant[],
  fallbackValue: unknown,
): string {
  if (fallbackValue === undefined || fallbackValue === null) {
    return '';
  }

  const match = variants.find(
    (variant) =>
      JSON.stringify(variant.value) === JSON.stringify(fallbackValue),
  );

  return match?.name ?? '';
}

export function createDefaultVariantValue(
  type: DefaultVariantType,
  firstVariant: Variant | null,
): DefaultVariantValue {
  switch (type) {
    case 'rollout_date': {
      return {
        type: 'rollout_date',
        start: {
          variant: firstVariant?.name ?? '',
          date: '',
          percentage: 0,
        },
        end: {
          variant: firstVariant?.name ?? '',
          date: '',
          percentage: 100,
        },
      };
    }
    case 'rollout_percentage': {
      return {
        type: 'rollout_percentage',
        distribution: firstVariant ? { [firstVariant.name]: 100 } : {},
      };
    }
    default: {
      return {
        type: 'basic',
        value: firstVariant?.name ?? '',
      };
    }
  }
}
