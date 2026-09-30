import type { LicenseWritable, License } from '@/api-client';
import type { LicenseFormValues } from '../../schemas';

const toOptionalSlug = (slug: string): string | undefined => {
  const trimmed = slug.trim();
  return trimmed === '' ? undefined : trimmed;
};

// lifecycleState is the state the license ends in: useLicenseSave creates it
// as a draft and publishes it once its grants are attached.
export const licenseFormValuesToLicenseInput = (
  values: LicenseFormValues,
): LicenseWritable => ({
  name: values.name,
  description: values.description,
  type: values.type,
  versionName: values.versionName,
  slug: toOptionalSlug(values.slug),
  isDefault: false,
  lifecycleState: values.createAsDraft ? 'DRAFT' : 'PUBLISHED',
});

// Deliberately omits slug, version and lifecycleState: the license is
// identified by the slug in the path, the version is assigned by the API and
// never changes, and the state moves through publish, archive and unarchive.
// Update refuses any of them that differs from the stored value with a 422, so
// leaving them out is the simplest way to change none.
export const licenseFormValuesToLicenseUpdateInput = (
  values: LicenseFormValues,
  currentLicense: License,
): LicenseWritable => ({
  description: values.description,
  isDefault: currentLicense.isDefault,
  name: values.name,
  type: values.type,
  versionName: values.versionName,
});
