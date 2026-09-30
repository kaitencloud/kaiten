import { useMemo } from 'react';
import type { License, LicenseFamilyView } from '@/api-client';
import {
  getFamilyHeadLicense,
  getLicenseFamilyKey,
  groupLicensesByFamily,
  normalizeLicenseFamilyName,
} from '../../utils/license-list.utils';
import { suggestNextVersionName } from '../../utils/license-version-name.utils';
import type { LicenseVersionFormValues } from './license-version-form.schema';
import { sortLicensesByDefaultThenVersion } from './license-version-form.schema';

type UseLicenseVersionFormOptionsArgs = {
  availableFamilies: LicenseFamilyView[];
  availableLicenses: License[];
  baseLicense?: License;
  selectedLicenseSlug?: string;
};

// One selectable product: the family (what a version joins), the name it is
// shown under (its head version's, since a family has no name of its own), and
// that head version, which a new version of the family starts from.
export type LicenseFamilyOption = {
  familyId: string;
  headLicense: License;
  label: string;
};

export function useLicenseVersionFormOptions({
  availableFamilies,
  availableLicenses,
  baseLicense,
  selectedLicenseSlug,
}: UseLicenseVersionFormOptionsArgs) {
  const licensesByFamily = useMemo(() => {
    return new Map(
      Array.from(groupLicensesByFamily(availableLicenses).entries()).map(
        ([familyId, licenses]) => [
          familyId,
          sortLicensesByDefaultThenVersion(licenses),
        ],
      ),
    );
  }, [availableLicenses]);

  // The products are the families the API lists, each under its head version.
  // One whose versions are not in the license list yet has nothing to start a
  // version from, and waits for the next read. Two products may share a name
  // -- only familyId groups versions -- and stay two options, both shown by
  // that name: the console shows no slug.
  const familyOptions = useMemo<LicenseFamilyOption[]>(() => {
    return availableFamilies
      .flatMap((family) => {
        const versions = licensesByFamily.get(family.id);
        const headLicense = versions && getFamilyHeadLicense(family, versions);
        return headLicense
          ? [
              {
                familyId: family.id,
                headLicense,
                label: normalizeLicenseFamilyName(headLicense.name),
              },
            ]
          : [];
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [availableFamilies, licensesByFamily]);

  const actualBaseLicense = useMemo(() => {
    if (baseLicense) {
      return baseLicense;
    }
    if (selectedLicenseSlug) {
      return availableLicenses.find(
        (license) => license.slug === selectedLicenseSlug,
      );
    }

    return familyOptions[0]?.headLicense;
  }, [availableLicenses, baseLicense, familyOptions, selectedLicenseSlug]);

  const selectedFamilyId = actualBaseLicense
    ? getLicenseFamilyKey(actualBaseLicense)
    : '';

  // The base's own version name is never offered back: submitted untouched it
  // would create a second version under that name. The family's next one is.
  const familyLicenses = selectedFamilyId
    ? (licensesByFamily.get(selectedFamilyId) ?? [])
    : [];

  const initialValues: LicenseVersionFormValues = {
    baseLicenseSlug: selectedLicenseSlug || (actualBaseLicense?.slug ?? ''),
    baseVersion: actualBaseLicense?.version ?? '',
    createAsDraft: false,
    description: actualBaseLicense?.description ?? '',
    selectedFamilyId,
    versionName: suggestNextVersionName(
      familyLicenses.map((license) => license.versionName),
    ),
  };

  return {
    actualBaseLicense,
    familyOptions,
    initialValues,
    licensesByFamily,
  };
}
