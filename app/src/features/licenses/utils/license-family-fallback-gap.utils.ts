import type { License, LicenseFamilyView } from '@/api-client';
import { getLicenseFamilyKey } from './license-list.utils';

type GapFamily = Pick<LicenseFamilyView, 'id' | 'isPublic'>;

type GapVersion = Pick<License, 'id' | 'pricingType'> & { familyId?: string };

/**
 * Whether a public family that has a paid version names no fallback. Such a
 * family is warned about, and not refused: a customer whose subscription ends
 * keeps a paid version of the license unbilled, and the family cannot be sold
 * through an anonymous checkout with an amount due today. `fallbackSlug` is the
 * fallback to judge, which the settings form passes as it stands before it is
 * saved; null or empty is none.
 */
export function hasFallbackGap({
  fallbackSlug,
  family,
  licenses,
}: {
  fallbackSlug: string | null | undefined;
  family: GapFamily;
  licenses: GapVersion[];
}): boolean {
  if (!family.isPublic || fallbackSlug) {
    return false;
  }

  return licenses.some(
    (license) =>
      getLicenseFamilyKey(license) === family.id &&
      license.pricingType === 'PAID',
  );
}
