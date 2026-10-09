import { useQuery } from '@tanstack/react-query';
import { useBillingCapabilities, useCanPerform } from '@/domains/billing';
import { instanceAddonsQueryOptions } from '../queries';
import { useAttachableAddons } from './use-attachable-addons';

/**
 * The add-ons the dialog that subscribes an instance can offer to start it with:
 * the versions on sale that fit the license family of the instance, of a family it
 * holds none of (a subscription that ended can leave some on the instance). The
 * API checks them as a whole with the subscription, so they are offered before it
 * starts and never after. Nothing is offered where the release has no add-ons or
 * the session cannot read the catalogue and the license families, and nothing is
 * asked for then.
 */
export function useSubscribeAddons({
  familyId,
  instanceSlug,
}: {
  /** The family the license of the instance belongs to (`License.familyId`). */
  familyId: string | undefined;
  instanceSlug: string;
}) {
  const featureOn = useBillingCapabilities().has('addons');
  const mayReadCatalogue = useCanPerform('addons.read');
  const mayReadFamilies = useCanPerform('licenseFamilies.list');
  const mayListHeld = useCanPerform('instance.addons.list');
  const offered = featureOn && mayReadCatalogue && mayReadFamilies;
  const held = useQuery({
    ...instanceAddonsQueryOptions(instanceSlug),
    enabled: offered && mayListHeld,
  });
  // What the instance holds is known, or cannot be read: either way, ask no longer.
  const heldSettled = !mayListHeld || !held.isPending;
  const attachable = useAttachableAddons({
    enabled: offered && heldSettled,
    familyId,
    held: held.data?.items ?? [],
  });

  const settled = offered && !attachable.isPending;

  return {
    addons: settled && !attachable.error ? attachable.items : [],
    isPending: offered && (!heldSettled || attachable.isPending),
    // What could not be read: the whole offer when the catalogue or the license
    // families could not, else the versions whose compatibility could not. The
    // others are still offered, and the person is told some are missing.
    readError: settled ? (attachable.error ?? attachable.unreadError) : null,
    refetch: attachable.refetch,
  };
}
