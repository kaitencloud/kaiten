import { z } from 'zod';
import {
  zBasic,
  zFeatureFlagWritable,
  zRolloutDate,
  zRolloutPercentage,
} from '@/api-client/zod.gen';
import { variantFormSchema } from '../variants';

// Custom schema for the form which extends the API writable schema
export const featureFlagFormSchema = zFeatureFlagWritable.extend({
  // Override name with custom validation message
  name: z.string().min(1, 'Name is required'),

  // Override slug with custom validation message
  slug: z.string().min(1, 'Slug is required'),

  // Override variants to use the form variant schema from feature/variants
  variants: z.union([z.array(variantFormSchema), z.null()]).refine(
    (variants) => {
      if (!variants || variants.length === 0) {
        return false;
      }
      // Check that all variants are valid (basic check)
      // Detailed type validation happens in the step form or using validateVariant
      return variants.every((variant) => {
        // Check name
        if (!variant.name || variant.name.length === 0) {
          return false;
        }

        // Check value exists
        if (variant.value === undefined || variant.value === null) {
          return false;
        }

        // For string values, check not empty
        if (typeof variant.value === 'string' && variant.value === '') {
          return false;
        }

        return true;
      });
    },
    {
      message:
        'Pages.FeatureFlags.Mutation.Form.Step2.Errors.allVariantsMustBeValid',
    },
  ),

  // Override default_variant to ensure it matches the union type correctly
  default_variant: z.union([zBasic, zRolloutDate, zRolloutPercentage]).refine(
    (val) => {
      if (val.type === 'basic') {
        return val.value.length > 0;
      }
      return true;
    },
    {
      message:
        'Pages.FeatureFlags.Mutation.Form.Step3.Errors.defaultVariantRequired',
    },
  ),
});

// Step-specific schemas for validation
export const step1Schema = featureFlagFormSchema.pick({
  name: true,
  description: true,
  slug: true,
  enabled: true,
  type: true,
  event_name: true,
  metadata: true,
});

export const step2Schema = featureFlagFormSchema.pick({
  variants: true,
});

export const step3Schema = featureFlagFormSchema.pick({
  default_variant: true,
});

export const step4Schema = featureFlagFormSchema.pick({
  targetings: true,
});
