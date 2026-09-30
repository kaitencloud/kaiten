import { formOptions } from '@tanstack/react-form';
import type { FeatureFlagWritable } from '@/api-client';
import { featureFlagFormSchema } from '../schemas/feature-flag.schema';

export const featureFlagFormOpts = formOptions({
  defaultValues: {
    // Step 1: Basic information
    name: '',
    description: null as string | null,
    slug: '',
    enabled: true,
    type: 'boolean' as 'boolean' | 'string' | 'number' | 'object',
    event_name: '',
    metadata: {} as Record<string, unknown>,

    // Step 2: Variants
    variants: null as Array<{
      name: string;
      description?: string;
      value: unknown;
    }> | null,

    // Step 3: Default variant
    default_variant: {
      type: 'basic',
      value: '',
    } as FeatureFlagWritable['default_variant'],

    // Step 4: Targeting rules
    targetings: [] as FeatureFlagWritable['targetings'],
  },
  validators: {
    onChange: featureFlagFormSchema as any,
  },
});
