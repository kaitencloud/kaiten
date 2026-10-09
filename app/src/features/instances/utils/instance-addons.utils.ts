import type {
  Addon,
  EntitlementUsage,
  InstanceAddon,
  Price,
} from '@/api-client';
import { getAddonTitle } from '@/domains/billing';

/**
 * One add-on an instance holds, with what the catalogue says of its version. The
 * catalogue is read apart and may be out of reach of the session or out of date, so
 * a version it does not know is shown by its slug, which the attachment always has.
 */
export type HeldAddon = {
  /** The version, when the catalogue could be read and still has it. */
  addon: Addon | undefined;
  held: InstanceAddon;
};

/** The add-ons an instance holds, each with its version, in the order they were attached. */
export function joinHeldAddons(
  held: readonly InstanceAddon[],
  versions: readonly Addon[],
): HeldAddon[] {
  const bySlug = new Map(versions.map((version) => [version.slug, version]));

  return held.map((attachment) => ({
    addon: bySlug.get(attachment.addonSlug),
    held: attachment,
  }));
}

/** What a held add-on is called: its version when the catalogue knows it, else its slug. */
export function getHeldAddonLabel({ addon, held }: HeldAddon): string {
  return addon ? getAddonTitle(addon) : held.addonSlug;
}

/** The bounds of a quantity: at least one unit, and at most what the version allows when it says. */
export function getQuantityBounds(addon: { maxQuantity?: number | null }): {
  max: number | undefined;
  min: 1;
} {
  return { max: addon.maxQuantity ?? undefined, min: 1 };
}

/** Whether a quantity may go up by one, or down by one without leaving the bounds. */
export function getQuantitySteps(
  quantity: number,
  addon: { maxQuantity?: number | null },
): { canDecrease: boolean; canIncrease: boolean } {
  const { max, min } = getQuantityBounds(addon);

  return {
    canDecrease: quantity > min,
    canIncrease: max === undefined || quantity < max,
  };
}

/**
 * Why a quantity is out of bounds, or nothing. A quantity the field could not read
 * is `NaN`: it is a quantity the person has not given yet.
 */
export type QuantityProblem = 'max' | 'min';

export function getQuantityProblem(
  quantity: number,
  addon: { maxQuantity?: number | null },
): QuantityProblem | undefined {
  const { max, min } = getQuantityBounds(addon);
  if (!Number.isInteger(quantity) || quantity < min) {
    return 'min';
  }

  return max !== undefined && quantity > max ? 'max' : undefined;
}

/** The flat fee a held add-on bills for each unit, once its instance is billed. */
export function getFlatFee(prices: readonly Price[]): Price | undefined {
  return prices.find((price) => price.billingModel === 'FLAT_FEE');
}

/**
 * Whether taking the add-on off still bills the period under way. A flat fee billed
 * in arrears covers the period that ends at the next invoice, and it is charged in
 * full, at the last quantity held, even for an add-on removed before that: nothing
 * the person does shortens it.
 */
export function isBilledInArrears(
  held: Pick<InstanceAddon, 'prices'>,
): boolean {
  return getFlatFee(held.prices)?.billingTiming === 'ARREARS';
}

/**
 * The versions an instance can be given: on sale, fitting its license family, and
 * of a family it holds no version of (one version of a family at a time: its
 * quantity changes, or it is taken off first). Both are listed by slug of family.
 */
export function getAttachableAddons(
  versions: readonly Addon[],
  {
    compatible,
    held,
  }: { compatible: ReadonlySet<string>; held: readonly InstanceAddon[] },
): Addon[] {
  const heldFamilies = new Set(held.map(({ familySlug }) => familySlug));

  return versions.filter(
    (version) =>
      version.lifecycleState === 'PUBLISHED' &&
      compatible.has(version.slug) &&
      !heldFamilies.has(version.familySlug),
  );
}

/** What an entitlement is worth to an instance: its effective limit, or flag, or configuration. */
export type EffectiveValue = EntitlementUsage['limit'];

/** An entitlement whose effective value is not the same before and after a change. */
export type EffectiveChange = {
  after: EffectiveValue;
  before: EffectiveValue;
  entitlementSlug: string;
};

const sameValue = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * The entitlements whose effective value changed between two reads of the usage of
 * an instance. The API computes the value (an add-on adds, replaces or raises what
 * the license grants, by the rule of each of its grants), so the console reports
 * the difference it reads and works nothing out itself. It is the `limit` that is
 * compared: for a number it is the effective cap, the counter being the usage, and
 * for a flag or a configuration it is the effective value itself.
 *
 * Without either read, nothing is known and nothing is said.
 */
export function diffEffectiveValues(
  before: readonly EntitlementUsage[] | undefined,
  after: readonly EntitlementUsage[] | undefined,
): EffectiveChange[] {
  if (!before || !after) {
    return [];
  }
  const was = new Map(
    before.map((usage) => [usage.entitlementSlug, usage.limit]),
  );
  const is = new Map(
    after.map((usage) => [usage.entitlementSlug, usage.limit]),
  );

  return [...new Set([...was.keys(), ...is.keys()])].flatMap(
    (entitlementSlug) =>
      sameValue(was.get(entitlementSlug), is.get(entitlementSlug))
        ? []
        : [
            {
              after: is.get(entitlementSlug),
              before: was.get(entitlementSlug),
              entitlementSlug,
            },
          ],
  );
}
