import type { LicenseWritable } from '@/api-client';
import { getLicense, updateLicense } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import { licenseToUpdateBody } from '../schemas/license-update-body';

export type SaveLicenseVariables = {
  /** What the form sends, built from the version it opened with. */
  edited: LicenseWritable;
  licenseSlug: string;
  /** What the form opened with, built by the function that built `edited`. */
  opened: LicenseWritable;
};

/**
 * Updates a version without overwriting what changed since the form opened. The
 * update replaces the version as a whole, and so would take back a default moved
 * to another version meanwhile, or the terms another tab saved: the version is
 * read again and the form's changes are applied on top of it (`writeOnFresh`). A
 * version deleted meanwhile is refused by the read, and nothing is written.
 */
export function saveLicenseOnFresh({
  edited,
  licenseSlug,
  opened,
}: SaveLicenseVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getLicense({
        ...FRESH_READ_OPTIONS,
        path: { licenseSlug },
        throwOnError: true,
      });

      return data;
    },
    restate: licenseToUpdateBody,
    write: async (body) => {
      const { data } = await updateLicense({
        body,
        path: { licenseSlug },
        throwOnError: true,
      });

      return data;
    },
  });
}
