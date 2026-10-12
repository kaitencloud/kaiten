import type { Addon } from '@/api-client';
import type { AddonHolder } from '../types';

/**
 * Whether lowering the most an instance can hold needs a look at who holds the
 * version. It does when the new maximum is a bound that is lower than the old one --
 * or the first bound a version gets: from unbounded, any bound is lower. Raising it,
 * keeping it and removing it (an empty field is `NaN`) can leave nobody over it.
 */
export function needsHoldersCheck(
  previous: Addon['maxQuantity'],
  next: number,
): boolean {
  return !Number.isNaN(next) && (previous === undefined || next < previous);
}

/**
 * The instance that holds the most of a version when that is more than the new
 * maximum allows, if the change needs the look. `readHolders` is called only then,
 * and its failure is the caller's: the change is not made when it cannot be checked.
 * The holders come sorted, most first, so the first is the one to name.
 */
export async function findBlockingHolder(
  addon: Pick<Addon, 'maxQuantity'>,
  next: number,
  readHolders: () => Promise<readonly AddonHolder[]>,
): Promise<AddonHolder | undefined> {
  if (!needsHoldersCheck(addon.maxQuantity, next)) {
    return undefined;
  }
  const [mostHeld] = await readHolders();

  return mostHeld && mostHeld.quantity > next ? mostHeld : undefined;
}
