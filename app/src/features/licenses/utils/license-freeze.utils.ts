/**
 * What says a version can no longer be changed where it is. The API refuses a
 * change to what a version sells for three reasons, each with its own code, and
 * answers all three the same way: a new version. Grants and prices are frozen
 * once a live subscription bills the version, the prices of a published version
 * are immutable, and an archived version takes no new price.
 *
 * The 409 is the only signal there is: no field of a version says it is billed,
 * so the console offers the change and shows the refusal.
 */
export type VersionFreezeReason = 'archived' | 'billed' | 'published';

const FREEZE_REASON_BY_CODE: Record<string, VersionFreezeReason> = {
  'AssociateEntitlementToLicense.BillingActive': 'billed',
  'CreateLicensePrice.BillingActive': 'billed',
  'CreateLicensePrice.VersionArchived': 'archived',
  'DeleteLicenseEntitlement.BillingActive': 'billed',
  'UpdateLicenseEntitlement.BillingActive': 'billed',
  'UpdateLicensePrice.VersionNotDraft': 'published',
};

/** Why the API refused to change a version, when it did because it is frozen. */
export const getVersionFreezeReason = (
  code: string | undefined,
): VersionFreezeReason | undefined =>
  code === undefined ? undefined : FREEZE_REASON_BY_CODE[code];

// Typed against the reasons, since no check reads a key built from a value at
// run time.
export const VERSION_FREEZE_TITLE_KEYS = {
  archived: 'Pages.Licenses.Freeze.archived.title',
  billed: 'Pages.Licenses.Freeze.billed.title',
  published: 'Pages.Licenses.Freeze.published.title',
} as const satisfies Record<VersionFreezeReason, string>;

export const VERSION_FREEZE_DESCRIPTION_KEYS = {
  archived: 'Pages.Licenses.Freeze.archived.description',
  billed: 'Pages.Licenses.Freeze.billed.description',
  published: 'Pages.Licenses.Freeze.published.description',
} as const satisfies Record<VersionFreezeReason, string>;
