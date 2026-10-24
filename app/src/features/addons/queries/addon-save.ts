import type { AddonChanges } from '@/api-client';
import { getAddon, updateAddon } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import { addonToChangesBody } from '../schemas';

export type SaveAddonVariables = {
  addonSlug: string;
  /** What the form sends, built from the version it opened with. */
  edited: AddonChanges;
  /** What the form opened with, built by the function that built `edited`. */
  opened: AddonChanges;
};

/**
 * Updates an add-on version without overwriting what changed since the form
 * opened. The update replaces the version as a whole, default flag included, so a
 * default moved to another version of the family in another tab would come back
 * to this one: the version is read again and the form's changes are applied on
 * top of it (`writeOnFresh`). A version deleted meanwhile is refused by the read,
 * and nothing is written.
 */
export function saveAddonOnFresh({
  addonSlug,
  edited,
  opened,
}: SaveAddonVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getAddon({
        ...FRESH_READ_OPTIONS,
        path: { addonSlug },
        throwOnError: true,
      });

      return data;
    },
    restate: (addon) => addonToChangesBody(addon, addon.isDefault),
    write: async (body) => {
      const { data } = await updateAddon({
        body,
        path: { addonSlug },
        throwOnError: true,
      });

      return data;
    },
  });
}
