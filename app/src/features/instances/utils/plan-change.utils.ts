import type { InstanceBilling, License, Price } from '@/api-client';

/** A plan a subscription can move to: an active flat fee of a license version on sale. */
export type PlanTarget = {
  license: License;
  price: Price;
};

/** Why a plan is listed and cannot be chosen. */
export type PlanTargetBlock = 'currency';

export const isOnSale = (license: License) =>
  (license.lifecycleState ?? 'PUBLISHED') === 'PUBLISHED';

const compareVersions = (left: License, right: License) =>
  (right.version ?? '').localeCompare(left.version ?? '', undefined, {
    numeric: true,
    sensitivity: 'base',
  });

/**
 * The plans the subscription of an instance can move to, from the versions of
 * every license and the active flat fees each reads back: those of the versions
 * on sale, whatever their family, the plan the subscription is on left out.
 * Versions come grouped by name and newest first, and the prices of a version in
 * the order the API lists them. A version with no price to offer is not listed.
 * The API checks all of this again; this tells the person before they ask.
 */
export function buildPlanTargets({
  licenses,
  pricesByLicense,
  subscription,
}: {
  licenses: readonly License[];
  /** The active flat fees of each version, by the slug of the version. */
  pricesByLicense: ReadonlyMap<string, readonly Price[]>;
  subscription: Pick<InstanceBilling, 'basePrice'>;
}): PlanTarget[] {
  return [...licenses]
    .filter(isOnSale)
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || compareVersions(left, right),
    )
    .flatMap((license) =>
      (pricesByLicense.get(license.slug ?? license.id) ?? [])
        .filter(
          (price) =>
            price.billingModel === 'FLAT_FEE' &&
            price.status === 'ACTIVE' &&
            price.id !== subscription.basePrice.id,
        )
        .map((price) => ({ license, price })),
    );
}

/**
 * Why a plan cannot be chosen, when it cannot. The invoice of the boundary bills
 * the old plan and the new one together, in one currency, so a plan in another
 * currency is shown and refused.
 */
export function getPlanTargetBlock(
  target: PlanTarget,
  subscription: Pick<InstanceBilling, 'currency'>,
): PlanTargetBlock | undefined {
  return target.price.currency === subscription.currency
    ? undefined
    : 'currency';
}

/** The plan a scheduled change moves to, among the plans that can be reached. */
export function findPlanTarget(
  targets: readonly PlanTarget[],
  priceId: string | undefined,
): PlanTarget | undefined {
  return priceId === undefined
    ? undefined
    : targets.find((target) => target.price.id === priceId);
}

/** Why a subscription cannot be moved to another plan, when it cannot. */
export type PlanChangeBlock =
  | 'canceled'
  | 'cancellation-scheduled'
  | 'not-subscribed'
  | 'trial';

/**
 * Whether a subscription takes a plan change: not one that never was, not one
 * that ended, not a trial (a longer trial or another plan is a cancellation and a
 * new subscription) and not one set to cancel (it has to be reactivated first). The
 * API refuses each in words; this is what the dialog tells before it opens a form.
 */
export function getPlanChangeBlock(
  subscription: Pick<InstanceBilling, 'cancelAtPeriodEnd' | 'status'> | null,
): PlanChangeBlock | undefined {
  if (subscription === null) {
    return 'not-subscribed';
  }
  if (subscription.status === 'CANCELED') {
    return 'canceled';
  }
  if (subscription.status === 'TRIAL') {
    return 'trial';
  }

  return subscription.cancelAtPeriodEnd ? 'cancellation-scheduled' : undefined;
}
