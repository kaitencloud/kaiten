import { z } from 'zod';
import type { Variant as ApiVariant } from '@/api-client/types.gen';
import { zVariant } from '@/api-client/zod.gen';

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

// UI Variant Schema using the generated API schema as base
export const variantFormSchema = zVariant;

// The inferred type from zVariant has { value: unknown; description: string; name: string; }
// ApiVariant has { value: unknown; description: string; name: string; }
// We need to make sure VariantFormState is compatible with the transform return type.
// We explicitly set description to string to satisfy TypeScript checks against generated types which might vary slightly in strictness or nullability in some contexts (though here they look same).
export type VariantFormState = {
  name: string;
  description: string;
  value: unknown;
};

// Specific schemas for form validation logic (validation per type)
const baseValidationSchema = zVariant
  .pick({
    name: true,
    description: true,
  })
  .extend({
    name: z.string().min(1, 'Features.Variants.Form.Errors.nameRequired'),
  });

export const booleanVariantSchema = baseValidationSchema.extend({
  value: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .refine(
      (val) => val !== undefined && val !== null,
      'Features.Variants.Form.Errors.valueRequired',
    ),
});

export const stringVariantSchema = baseValidationSchema.extend({
  value: z.string().min(1, 'Features.Variants.Form.Errors.valueRequired'),
});

export const numberVariantSchema = baseValidationSchema.extend({
  value: z.number({
    error: (issue) =>
      issue.input === undefined
        ? 'Features.Variants.Form.Errors.valueRequired'
        : 'Features.Variants.Form.Errors.valueInvalidNumber',
  }),
});

export const objectVariantSchema = baseValidationSchema.extend({
  value: z.union([z.record(z.string(), z.any()), z.string()]).refine(
    (val) => {
      if (typeof val === 'string') {
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Features.Variants.Form.Errors.valueInvalidJSON',
    },
  ),
});

// VARIANT_TYPE_OPTIONS for UI
export const VARIANT_TYPE_OPTIONS = [
  { value: 'boolean' as const, label: 'Boolean' },
  { value: 'string' as const, label: 'String' },
  { value: 'number' as const, label: 'Number' },
  { value: 'object' as const, label: 'JSON Object' },
];

// -----------------------------------------------------------------------------
// Transformers
// -----------------------------------------------------------------------------

// Transform API variants to Form variants (adding UI state)
export function mapToFormVariants(
  variants: ApiVariant[] | null,
): VariantFormState[] | null {
  if (!variants) return null;
  return variants.map((variant) => ({
    name: variant.name,
    description: variant.description || '',
    value: variant.value,
  }));
}

// Transform Form variants to API variants (cleaning UI state)
export function mapToApiVariants(
  variants: VariantFormState[] | null,
): ApiVariant[] | null {
  if (!variants) return null;
  // Remove any unknown properties not in the API schema
  return variants.map(({ ...rest }) => ({
    name: rest.name,
    description: rest.description,
    value: rest.value,
  }));
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Helper to get the right schema based on type
export function getVariantSchemaByType(
  type: 'boolean' | 'string' | 'number' | 'object',
) {
  switch (type) {
    case 'boolean':
      return booleanVariantSchema;
    case 'string':
      return stringVariantSchema;
    case 'number':
      return numberVariantSchema;
    case 'object':
      return objectVariantSchema;
    default:
      return variantFormSchema;
  }
}

// Validation function
export function validateVariant(
  variant: unknown,
  type: 'boolean' | 'string' | 'number' | 'object',
) {
  switch (type) {
    case 'boolean':
      return booleanVariantSchema.safeParse(variant);
    case 'string':
      return stringVariantSchema.safeParse(variant);
    case 'number':
      return numberVariantSchema.safeParse(variant);
    case 'object':
      return objectVariantSchema.safeParse(variant);
    default:
      return { success: false, error: 'Invalid type' };
  }
}

// Check for duplicate names
export function hasDuplicateNames(variants: { name: string }[]): boolean {
  const names = variants.map((v) => v.name);
  return new Set(names).size !== names.length;
}

// Generate a unique variant name that doesn't conflict with existing variants
export function generateUniqueVariantName(
  existingVariants: { name: string }[],
  prefix = 'variant',
): string {
  const existingNames = new Set(existingVariants.map((v) => v.name));
  let counter = 1;
  let name = `${prefix}_${counter}`;

  while (existingNames.has(name)) {
    counter++;
    name = `${prefix}_${counter}`;
  }

  return name;
}
