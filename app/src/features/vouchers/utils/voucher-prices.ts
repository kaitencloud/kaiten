import type { PriceOption } from '../types';

/**
 * Splits one list of checked prices back into the two a voucher holds, those of a license
 * version and those of an add-on version, by the owner each price was listed under. A
 * price the console no longer lists stays in the list it was in: it is a limit the
 * voucher carries, and an unchecking is a person's act, never a side effect of the split.
 */
export function splitPriceSelection(
  checked: readonly string[],
  options: readonly PriceOption[],
  previous: { addon: readonly string[]; license: readonly string[] },
): { addon: string[]; license: string[] } {
  const ofAddons = new Set(
    options
      .filter(({ ownerKind }) => ownerKind === 'ADDON')
      .map(({ id }) => id),
  );
  const ofLicenses = new Set(
    options
      .filter(({ ownerKind }) => ownerKind === 'LICENSE')
      .map(({ id }) => id),
  );

  const heldByAddons = new Set(previous.addon);
  const heldByLicenses = new Set(previous.license);

  return {
    addon: checked.filter(
      (id) => ofAddons.has(id) || (!ofLicenses.has(id) && heldByAddons.has(id)),
    ),
    license: checked.filter(
      (id) =>
        ofLicenses.has(id) || (!ofAddons.has(id) && heldByLicenses.has(id)),
    ),
  };
}
