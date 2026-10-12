import type { CanceledSubscription, InstanceBilling } from '@/api-client';
import { instantToDateTimeInput } from '@/lib/date-time-input';
import type { CancelFollowUpsOutcome } from '../hooks/use-cancel-follow-ups';

/**
 * How a cancellation took effect. A trial ends at once whatever the mode,
 * and so does an immediate one; one at the end of the period leaves the
 * subscription running until then.
 */
export type CancellationKind = 'IMMEDIATE' | 'SCHEDULED' | 'TRIAL';

/** What the cancel dialog says once the API accepted the cancellation. */
export type CancelOutcome = {
  canceled: CanceledSubscription;
  followUps: CancelFollowUpsOutcome;
  kind: CancellationKind;
};

/** How a cancellation of this subscription takes effect, from the mode asked for. */
export function getCancellationKind(
  subscription: Pick<InstanceBilling, 'status'>,
  mode: 'AT_PERIOD_END' | 'IMMEDIATE',
): CancellationKind {
  if (subscription.status === 'TRIAL') {
    return 'TRIAL';
  }

  return mode === 'IMMEDIATE' ? 'IMMEDIATE' : 'SCHEDULED';
}

/**
 * The day the license of the instance is proposed to end on when the
 * cancellation also sets it: the end of the period for a cancellation that waits
 * for it, and now for one that does not. The person can change it.
 */
export function getProposedEndDate(
  subscription: Pick<InstanceBilling, 'currentPeriodEnd'>,
  mode: 'AT_PERIOD_END' | 'IMMEDIATE',
  now: Date = new Date(),
): string {
  return mode === 'AT_PERIOD_END'
    ? instantToDateTimeInput(subscription.currentPeriodEnd)
    : instantToDateTimeInput(now.toISOString());
}

/**
 * What a retry of the follow-ups that failed leaves, with what the first try had
 * already done: the add-ons removed are all of them, the ones that failed are the
 * ones the retry failed on, and the end of the license is what the retry made of it.
 */
export function mergeFollowUps(
  previous: CancelFollowUpsOutcome,
  next: CancelFollowUpsOutcome,
): CancelFollowUpsOutcome {
  return {
    addons:
      previous.addons === null && next.addons === null
        ? null
        : {
            failed: next.addons?.failed ?? [],
            removed: [
              ...(previous.addons?.removed ?? []),
              ...(next.addons?.removed ?? []),
            ],
          },
    endLicenseDate: next.endLicenseDate ?? previous.endLicenseDate,
  };
}

/** What a retry has left to do: the add-ons that could not be removed, and the end that could not be set. */
export function getFailedFollowUps(outcome: CancelFollowUpsOutcome) {
  return {
    addonSlugs: (outcome.addons?.failed ?? []).map(
      ({ addonSlug }) => addonSlug,
    ),
    endLicenseDate:
      outcome.endLicenseDate && !outcome.endLicenseDate.ok
        ? outcome.endLicenseDate.instant
        : null,
  };
}

/** Whether anything the person asked for beside the cancellation is still to do. */
export function hasFailedFollowUps(outcome: CancelFollowUpsOutcome): boolean {
  const failed = getFailedFollowUps(outcome);

  return failed.addonSlugs.length > 0 || failed.endLicenseDate !== null;
}
