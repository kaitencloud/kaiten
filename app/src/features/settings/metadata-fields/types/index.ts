import type { MetadataFieldFormValues } from '../schemas';

// The form value types are derived from the Zod schemas (the source of truth
// for validation) and re-exported here so the public `./metadata-fields.types`
// surface stays stable.
export type {
  MetadataFieldFormState,
  MetadataFieldFormValues,
  MetadataPrimaryType,
} from '../schemas';
export type {
  MetadataResourceType,
  MetadataSettingsField,
} from '@/domains/metadata-fields';

export type MetadataFieldFormErrors = Partial<
  Record<keyof MetadataFieldFormValues, string>
>;

/**
 * Non-blocking advisories surfaced under the form fields. Distinct from
 * `MetadataFieldFormErrors` because the form stays submittable — the warning
 * lets the admin double-check, not block them. Backend stays the source of
 * truth on what's actually rejected.
 */
export type MetadataFieldFormWarnings = Partial<
  Record<keyof MetadataFieldFormValues, string>
>;

export type MetadataDryRunImpactSample = {
  name: string;
  slug: string;
};

// Shape of the server-side dry-run impact preview
// (POST /metadata-fields/{id}/dry-run). Mirrors the generated `Impact` type;
// kept as a feature-local alias so the confirmation dialog and page state
// don't reach into the generated client types directly.
export type MetadataDryRunImpact = {
  count: number;
  samples: MetadataDryRunImpactSample[];
};
