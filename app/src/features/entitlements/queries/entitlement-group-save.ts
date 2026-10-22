import type { EntitlementGroup, EntitlementGroupWritable } from '@/api-client';
import { getEntitlementGroup, updateEntitlementGroup } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';

export type SaveEntitlementGroupVariables = {
  /** What the form sends, built from the group it opened with. */
  edited: EntitlementGroupWritable;
  entitlementGroupSlug: string;
  /** What the form opened with, built by the function that built `edited`. */
  opened: EntitlementGroupWritable;
};

/** The update that restates a group as it stands: its name and its description. */
export const entitlementGroupToUpdateBody = (
  group: Pick<EntitlementGroup, 'description' | 'name'>,
): EntitlementGroupWritable => ({
  description: group.description ?? '',
  name: group.name,
});

/**
 * Updates a group without overwriting what changed since the form opened. The
 * update replaces the group as a whole, so saving the name from an old page would
 * take back a description saved from another tab: the group is read again and the
 * form's changes are applied on top of it (`writeOnFresh`). A group deleted
 * meanwhile is refused by the read, and nothing is written. The update answers
 * with no body: this resolves to the body that was sent, which is what the cache
 * is given.
 */
export function saveEntitlementGroupOnFresh({
  edited,
  entitlementGroupSlug,
  opened,
}: SaveEntitlementGroupVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getEntitlementGroup({
        ...FRESH_READ_OPTIONS,
        path: { entitlementGroupSlug },
        throwOnError: true,
      });

      return data;
    },
    restate: entitlementGroupToUpdateBody,
    write: async (body) => {
      await updateEntitlementGroup({
        body,
        path: { entitlementGroupSlug },
        throwOnError: true,
      });

      return body;
    },
  });
}
