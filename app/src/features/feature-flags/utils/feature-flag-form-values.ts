import { mapToFormVariants } from '../variants';
import type { FeatureFlagFormProps, FeatureFlagFormValues } from '../types';
import { featureFlagFormOpts } from './shared-form';

/**
 * The form of a flag as it stands, which is also the body an update restates it
 * with: the update replaces the flag as a whole, and the form is made of every
 * member it takes. A form for a new flag starts empty.
 */
export function getFeatureFlagFormInitialValues(
  featureFlag?: FeatureFlagFormProps['featureFlag'],
): FeatureFlagFormValues {
  if (!featureFlag) {
    return featureFlagFormOpts.defaultValues;
  }

  return {
    name: featureFlag.name,
    description: featureFlag.description,
    slug: featureFlag.slug ?? '',
    enabled: featureFlag.enabled,
    type: featureFlag.type,
    event_name: featureFlag.event_name,
    metadata: featureFlag.metadata,
    variants: mapToFormVariants(featureFlag.variants) ?? null,
    default_variant: featureFlag.default_variant,
    targetings: featureFlag.targetings,
  };
}
