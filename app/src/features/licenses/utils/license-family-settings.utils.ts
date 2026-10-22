import type { License, LicenseFamilyView } from '@/api-client';
import { NO_FALLBACK } from '../schemas/license-family-settings.schema';
import {
  getFamilyHeadLicense,
  groupLicensesByFamily,
} from './license-list.utils';

/** The name a family is shown under: its head version's, else its slug. */
export function getFamilyName(
  family: LicenseFamilyView,
  licenses: License[],
): string {
  const versions = licenses.filter(
    (license) => (license.familyId ?? license.id) === family.id,
  );

  return getFamilyHeadLicense(family, versions)?.name?.trim() || family.slug;
}

export type FallbackOption = {
  /** The name the family is shown under: its head version's. */
  label: string;
  /** What the update is written with, or the sentinel for none. */
  value: string;
};

/**
 * The families a family can fall back to: another family of the organization whose
 * every version is priced FREE, which the API checks (422 `.InvalidFallback`
 * otherwise, an unknown family included). The console offers only those, so the
 * choice is one the API accepts as far as the lists say. The stored fallback is
 * always listed, even if the lists no longer show it as free, so that the select
 * says what the family has and not "none".
 */
export function getFallbackOptions({
  families,
  family,
  licenses,
  noneLabel,
}: {
  families: LicenseFamilyView[];
  family: LicenseFamilyView;
  licenses: License[];
  noneLabel: string;
}): FallbackOption[] {
  const versionsByFamily = groupLicensesByFamily(licenses);
  const labelOf = (candidate: LicenseFamilyView) =>
    getFamilyName(candidate, licenses);

  const options = families
    .filter((candidate) => {
      if (candidate.id === family.id) {
        return false;
      }
      const versions = versionsByFamily.get(candidate.id) ?? [];

      return (
        versions.length > 0 &&
        versions.every((version) => version.pricingType === 'FREE')
      );
    })
    .map((candidate) => ({ label: labelOf(candidate), value: candidate.slug }))
    .sort((left, right) => left.label.localeCompare(right.label));

  const stored = family.fallbackLicenseFamilySlug;
  if (stored && !options.some((option) => option.value === stored)) {
    const storedFamily = families.find(
      (candidate) => candidate.slug === stored,
    );
    options.push({
      label: storedFamily ? labelOf(storedFamily) : stored,
      value: stored,
    });
  }

  return [{ label: noneLabel, value: NO_FALLBACK }, ...options];
}
