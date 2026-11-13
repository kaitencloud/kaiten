import type { License } from '@/api-client';
import { defineFormRecovery } from '@/functionals/form-recovery';
import type { EditableLicenseEntitlement } from '../../utils';
import {
  type LicenseVersionFormValues,
  licenseVersionFormSchema,
} from './license-version-form.schema';
import { draftEntitlementsSchema } from './license-recovery';

/** Today's data the recovery of a new version reads: the base it starts from. */
export type LicenseVersionRecoveryReferences = {
  /** The base version now selected, as the catalog holds it; null when none is. */
  baseLicense: License | null;
};

const MUTATION = 'Pages.Licenses.Mutation.Form.Labels';
const VERSION = 'Pages.Licenses.Version.Form';

/**
 * What the creation of a new version keeps when it is left unsent: its fields, and
 * the grants it starts with (`extra`), copied from its base version and written only
 * once a row was added, changed or removed. The rows remember the base they were
 * copied from, by its slug and when it last changed: a base changed since drops them
 * on a resume, and the base's own are loaded again. Nothing here is a secret, a code
 * entered once or a person's data, so `omit` is empty. One long page: no steps.
 */
export const licenseVersionRecovery = defineFormRecovery<
  LicenseVersionFormValues,
  LicenseVersionRecoveryReferences,
  EditableLicenseEntitlement[]
>({
  formId: 'licenses.createVersion',
  version: 1,
  omit: [],
  schema: licenseVersionFormSchema,
  extraSchema: draftEntitlementsSchema,
  extraSource: ({ baseLicense }) =>
    baseLicense ? `${baseLicense.slug ?? ''}@${baseLicense.updatedAt}` : null,
  extraSourceLabel: { key: `${VERSION}.Recovery.baseSource` },
  fieldLabels: {
    baseLicenseSlug: { key: `${VERSION}.Labels.baseVersion` },
    baseVersion: { key: `${VERSION}.Labels.baseVersion` },
    copyAiRules: { key: 'AI.copyRules' },
    copyPrices: { key: `${VERSION}.Labels.copyPrices` },
    createAsDraft: { key: `${MUTATION}.createAsDraft` },
    description: { key: `${MUTATION}.description` },
    selectedFamilyId: { key: `${VERSION}.Labels.licenseName` },
    versionName: { key: `${MUTATION}.versionName` },
  },
});
