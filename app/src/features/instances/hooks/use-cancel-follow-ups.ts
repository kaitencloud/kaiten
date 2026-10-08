import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Instance } from '@/api-client';
import {
  detachInstanceAddonMutation,
  updateInstanceMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { invalidateInstanceBillingQueries } from '@/domains/billing';

/** What a person asked the cancellation to do beside ending the subscription. */
export type CancelFollowUps = {
  /** The versions of the add-ons to remove from the instance. */
  addonSlugs: readonly string[];
  /** The instant the license of the instance ends, when it is to be set. */
  endLicenseDate: string | null;
};

/** What became of each: an add-on that could not be removed, the end that could not be set. */
export type CancelFollowUpsOutcome = {
  /** Null when no add-on was to be removed. */
  addons: {
    failed: ReadonlyArray<{ addonSlug: string; error: unknown }>;
    removed: readonly string[];
  } | null;
  /** Null when the end of the license was not to be set. */
  endLicenseDate:
    | { instant: string; ok: true }
    | { error: unknown; instant: string; ok: false }
    | null;
};

/**
 * The two things a cancellation does not do by itself and offers to do beside
 * it: take the add-ons off the instance, and end its license. Cancelling changes
 * billing only, so each is a request of its own, made once the cancellation is
 * accepted, one after the other (removing an add-on locks the subscription, and
 * two at once would only wait on each other). A failure of one does not stop
 * the rest, and none undoes the cancellation: the outcome says what was done and
 * what was not, for the person to try again.
 *
 * Neither is optimistic, and the screens that show the subscription, the
 * add-ons and the instance are refreshed at the end.
 */
export function useCancelFollowUps(instance: Instance) {
  const queryClient = useQueryClient();
  const instanceSlug = instance.slug ?? instance.id;
  const detach = useMutation(detachInstanceAddonMutation());
  const update = useMutation(updateInstanceMutation());

  async function run(
    followUps: CancelFollowUps,
  ): Promise<CancelFollowUpsOutcome> {
    const removed: string[] = [];
    const failed: Array<{ addonSlug: string; error: unknown }> = [];
    for (const addonSlug of followUps.addonSlugs) {
      try {
        await detach.mutateAsync({ path: { addonSlug, instanceSlug } });
        removed.push(addonSlug);
      } catch (error) {
        failed.push({ addonSlug, error });
      }
    }

    let endLicenseDate: CancelFollowUpsOutcome['endLicenseDate'] = null;
    const instant = followUps.endLicenseDate;
    if (instant !== null) {
      try {
        // The PUT replaces the instance: everything it holds is sent back as it
        // is, with the one date changed. The slug is left out, which keeps it.
        await update.mutateAsync({
          body: {
            customerId: instance.customerId,
            deploymentZoneId: instance.deploymentZoneId,
            description: instance.description,
            endLicenseDate: instant,
            licenseId: instance.licenseId,
            metadata: instance.metadata ?? {},
            name: instance.name,
            startLicenseDate: instance.startLicenseDate,
          },
          path: { instanceSlug },
        });
        endLicenseDate = { instant, ok: true };
      } catch (error) {
        endLicenseDate = { error, instant, ok: false };
      }
    }
    await invalidateInstanceBillingQueries(queryClient, instanceSlug);

    return {
      addons: followUps.addonSlugs.length > 0 ? { failed, removed } : null,
      endLicenseDate,
    };
  }

  return { isPending: detach.isPending || update.isPending, run };
}
