import type { FeatureFlag } from '@/api-client';
import type { featureFlagFormOpts } from '../utils/shared-form';

// Infer the form values type from the form options
export type FeatureFlagFormValues = typeof featureFlagFormOpts.defaultValues;
export type FeatureFlagValueType = FeatureFlagFormValues['type'];

export type FeatureFlagFormProps = {
  featureFlag?: FeatureFlag;
};

export type GeneralValues = Pick<
  FeatureFlagFormValues,
  'name' | 'description' | 'slug' | 'enabled' | 'type'
>;

export type VariantsValues = Pick<FeatureFlagFormValues, 'variants'>;

export type DefaultVariantValues = Pick<
  FeatureFlagFormValues,
  'default_variant'
>;

export type TargetingValues = Pick<FeatureFlagFormValues, 'targetings'>;

/**
 * Type helpers for form composition
 *
 * Props defined here are the external props passed to the step components.
 * The `form` prop is automatically required by the `withForm` HOC from TanStack Form,
 * but we don't need to define it here as it's inferred.
 */

export type GeneralFormProps = {
  featureFlag?: FeatureFlag;
};

export type VariantsFormProps = {
  variantType: string;
};

export type DefaultVariantFormProps = object;

export type TargetingFormProps = object;
