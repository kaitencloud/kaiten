import type { FeatureFlagWritable } from '@/api-client';
import { getFeatureFlag, updateFeatureFlag } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import type { FeatureFlagFormValues } from '../types';
import { getFeatureFlagFormInitialValues } from '../utils/feature-flag-form-values';

export type SaveFeatureFlagVariables = {
  /** What the form sends, built from the flag it opened with. */
  edited: FeatureFlagFormValues;
  featureFlagSlug: string;
  /** What the form opened with, built by the function that built `edited`. */
  opened: FeatureFlagFormValues;
};

/**
 * Updates a flag without overwriting what changed since the form opened. The
 * update replaces the flag as a whole, rules and variants included, so a switch
 * flipped from the list would take back the targeting another tab saved: the
 * flag is read again and the form's changes are applied on top of it
 * (`writeOnFresh`). A flag deleted meanwhile is refused by the read, and nothing
 * is written. The update answers with no body: this resolves to the body that
 * was sent, which is what the caches are given.
 */
export function saveFeatureFlagOnFresh({
  edited,
  featureFlagSlug,
  opened,
}: SaveFeatureFlagVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getFeatureFlag({
        ...FRESH_READ_OPTIONS,
        path: { featureFlagSlug },
        throwOnError: true,
      });

      return data;
    },
    restate: getFeatureFlagFormInitialValues,
    write: async (body) => {
      // The form holds the variants as the API takes them.
      const sent = body as FeatureFlagWritable;
      await updateFeatureFlag({
        body: sent,
        path: { featureFlagSlug },
        throwOnError: true,
      });

      return sent;
    },
  });
}
