import type { AddonGrant } from '@/api-client';
import { getAddonEntitlement, updateAddonEntitlement } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import {
  grantFormValuesToUpdateBody,
  grantToFormValues,
} from '../schemas/addon-grant.schema';

export type SaveAddonGrantVariables = {
  addonSlug: string;
  /** What the form sends, built from the grant it opened with. */
  edited: AddonGrant;
  entitlementSlug: string;
  /** What the form opened with, built by the function that built `edited`. */
  opened: AddonGrant;
};

/**
 * Updates a grant of an add-on version without overwriting what changed since
 * the form opened. The update replaces the grant as a whole, value, behavior and
 * overage together, so an old dialog would take back a behavior saved from
 * another tab: the grant is read again and the form's changes are applied on top
 * of it (`writeOnFresh`). A grant removed meanwhile is refused by the read, and
 * nothing is written.
 */
export function saveAddonGrantOnFresh({
  addonSlug,
  edited,
  entitlementSlug,
  opened,
}: SaveAddonGrantVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getAddonEntitlement({
        ...FRESH_READ_OPTIONS,
        path: { addonSlug, entitlementSlug },
        throwOnError: true,
      });

      return data;
    },
    restate: (grant) => grantFormValuesToUpdateBody(grantToFormValues(grant)),
    write: async (body) => {
      const { data } = await updateAddonEntitlement({
        body,
        path: { addonSlug, entitlementSlug },
        throwOnError: true,
      });

      return data;
    },
  });
}
