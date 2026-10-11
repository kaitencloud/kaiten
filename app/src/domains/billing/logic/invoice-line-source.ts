import type { InvoiceLine } from '@/api-client';

/**
 * The members of a line that say whose price it bills. Any of them may be missing
 * from a line the console is given (the schema of a line is open), and a discount
 * has none of them.
 */
type PriceMembers = Partial<
  Pick<
    InvoiceLine,
    'addonId' | 'addonPriceId' | 'instanceAddonId' | 'licensePriceId'
  >
>;

/**
 * Whose price a line bills. A line is billed from a licence price (the base fee, and
 * the usage and overage a licence rates) or from an add-on price (the fee of an
 * add-on, and the usage and overage an add-on rates). Usage and overage lines used
 * to come from a licence alone, so a line that has no `licensePriceId` is not
 * necessarily a line with no price.
 */
export type InvoiceLineSource =
  | {
      /** The add-on version the line bills, when the line says. */
      addonId: string | null;
      /** The add-on price the line bills, when the line says. */
      addonPriceId: string | null;
      /** The attachment of the instance the line bills, when the line says. */
      instanceAddonId: string | null;
      kind: 'ADDON';
    }
  | { kind: 'LICENSE'; priceId: string }
  | { kind: 'NONE' };

/**
 * Where the price of a line comes from, read from the members of the line and never
 * from its type or its label: an add-on line carries `addonPriceId`, `addonId` and
 * `instanceAddonId` and no `licensePriceId`, whether it bills the fee of the add-on
 * or what it rated on usage.
 */
export function getInvoiceLineSource(line: PriceMembers): InvoiceLineSource {
  const addonId = line.addonId ?? null;
  const addonPriceId = line.addonPriceId ?? null;
  const instanceAddonId = line.instanceAddonId ?? null;

  if (addonPriceId !== null || addonId !== null || instanceAddonId !== null) {
    return { addonId, addonPriceId, instanceAddonId, kind: 'ADDON' };
  }
  const licensePriceId = line.licensePriceId ?? null;

  return licensePriceId === null
    ? { kind: 'NONE' }
    : { kind: 'LICENSE', priceId: licensePriceId };
}
