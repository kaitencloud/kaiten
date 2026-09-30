import type { TFunction } from 'i18next';
import type { License } from '@/api-client';

const byNameThenNewestVersion = (left: License, right: License): number =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
  right.version.localeCompare(left.version, undefined, { numeric: true });

// An archived version is withdrawn from sale: the API refuses to assign it to
// an instance (CreateInstance.LicenseArchived, UpdateInstance.LicenseArchived).
// The one kept is the instance's own license, which the instance may stay on
// after its version was archived -- dropping it would empty the field of an
// edit form. Drafts stay offered, so a version can be tried before it is
// published.
export function getAssignableLicenses(
  licenses: License[],
  currentLicenseSlug?: string,
): License[] {
  return licenses
    .filter(
      (license) =>
        license.lifecycleState !== 'ARCHIVED' ||
        (currentLicenseSlug !== undefined &&
          license.slug === currentLicenseSlug),
    )
    .sort(byNameThenNewestVersion);
}

// Versions of one product share a name, so the name alone cannot tell them
// apart in a picker: the version number does, and drafts and archived versions
// say what they are. The console shows no slug, so two products sharing a name
// (only familyId groups versions) read the same here.
export function formatLicenseOptionLabel(
  license: License,
  t: TFunction,
): string {
  const label = t(
    'Pages.Customers.Instances.Mutation.Form.LicenseOptions.label',
    { name: license.name, version: license.version },
  );

  if (license.lifecycleState === 'DRAFT') {
    return t('Pages.Customers.Instances.Mutation.Form.LicenseOptions.draft', {
      label,
    });
  }
  if (license.lifecycleState === 'ARCHIVED') {
    return t(
      'Pages.Customers.Instances.Mutation.Form.LicenseOptions.archived',
      { label },
    );
  }
  return label;
}
