import type { EntitlementWritable } from '@/api-client';
import { getEntitlement, updateEntitlement } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import { entitlementToUpdateBody } from '../utils/entitlement-writable';

export type SaveEntitlementVariables = {
  /** What the form sends, built from the entitlement it opened with. */
  edited: EntitlementWritable;
  entitlementSlug: string;
  /** What the form opened with, built by the function that built `edited`. */
  opened: EntitlementWritable;
};

/**
 * Updates an entitlement without overwriting what changed since the form
 * opened. The update replaces the entitlement as a whole, so an old page would
 * take back an icon, a group or a unit saved from another tab: the entitlement
 * is read again and the form's changes are applied on top of it (`writeOnFresh`).
 * An entitlement deleted meanwhile is refused by the read, and nothing is written.
 */
export function saveEntitlementOnFresh({
  edited,
  entitlementSlug,
  opened,
}: SaveEntitlementVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getEntitlement({
        ...FRESH_READ_OPTIONS,
        path: { entitlementSlug },
        throwOnError: true,
      });

      return data;
    },
    restate: (entitlement) => entitlementToUpdateBody(entitlement),
    write: async (body) => {
      const { data } = await updateEntitlement({
        body,
        path: { entitlementSlug },
        throwOnError: true,
      });

      return data;
    },
  });
}
