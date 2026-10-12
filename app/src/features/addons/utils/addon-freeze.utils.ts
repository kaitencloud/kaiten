/**
 * What says a version can no longer be changed where it is. The API refuses to
 * change what a version sells for two reasons, each with its own code, and answers
 * both the same way: a new version. Grants and prices are frozen once an instance
 * with a live subscription holds the version, and an archived version takes no new
 * price.
 *
 * The 409 is the only signal there is: no field of a version says it is billed, so
 * the console offers the change and shows the refusal.
 */
export type AddonFreezeReason = 'archived' | 'billed';

const FREEZE_REASON_BY_CODE: Record<string, AddonFreezeReason> = {
  'AssignAddonEntitlement.BillingActive': 'billed',
  'CreateAddonPrice.BillingActive': 'billed',
  'CreateAddonPrice.VersionArchived': 'archived',
  'UnassignAddonEntitlement.BillingActive': 'billed',
  'UpdateAddonEntitlement.BillingActive': 'billed',
};

/** Why the API refused to change a version, when it did because it is frozen. */
export const getAddonFreezeReason = (
  code: string | undefined,
): AddonFreezeReason | undefined =>
  code === undefined ? undefined : FREEZE_REASON_BY_CODE[code];

// Typed against the reasons, since no check reads a key built from a value at run
// time.
export const ADDON_FREEZE_TITLE_KEYS = {
  archived: 'Pages.Addons.Freeze.archived.title',
  billed: 'Pages.Addons.Freeze.billed.title',
} as const satisfies Record<AddonFreezeReason, string>;

export const ADDON_FREEZE_DESCRIPTION_KEYS = {
  archived: 'Pages.Addons.Freeze.archived.description',
  billed: 'Pages.Addons.Freeze.billed.description',
} as const satisfies Record<AddonFreezeReason, string>;
