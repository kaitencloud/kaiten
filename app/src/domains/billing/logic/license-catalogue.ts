import type { License, Price } from '@/api-client';
import type { GetLicensesWithPricesQuery } from '@/api-client/graphql/graphql';
import { zLicense, zPrice, zPriceMeter } from '@/api-client/zod.gen';

type LicenseItem = GetLicensesWithPricesQuery['licenses']['items'][number];
type PriceItem = LicenseItem['prices'][number];

/** What `GetLicensesWithPrices` sends of a license version and of each of its prices. */
export type LicenseWithPricesInput = LicenseItem;
export type CatalogPriceInput = PriceItem;

/**
 * A price as the screens that read the catalogue show it. It has the members of the
 * contract's `Price` that a price is described by (its model, period, timing,
 * currency, amount and meter, its label and order, whether it is the default of its
 * period), and none of the stamps the GraphQL document leaves out.
 */
export type CatalogPrice = Omit<
  Price,
  'createdAt' | 'deprecatedAt' | 'updatedAt'
>;

/** How a license version is sold (`License.pricingType`). */
export type LicensePricingType = NonNullable<License['pricingType']>;

/**
 * A license version with the prices it is sold at now. Every enum of the document is
 * a plain string there, where the contract has enums, so each is checked against the
 * contract: a state or a pricing type the console does not know is left `undefined`
 * and a price it cannot read is dropped, so that the screens that read this never
 * meet a value they have no label for.
 */
export type LicenseWithPrices = {
  id: string;
  /** Whether the version may be served; `undefined` for a state this console does not know. */
  lifecycleState: NonNullable<License['lifecycleState']> | undefined;
  name: string;
  /** How the version is sold; `undefined` for a way this console does not know. */
  pricingType: LicensePricingType | undefined;
  /** The ACTIVE prices of the version, in the order the API lists them. */
  prices: CatalogPrice[];
  slug: string;
  version: string;
  versionName?: string;
};

const lifecycleStateSchema = zLicense.shape.lifecycleState;
const pricingTypeSchema = zLicense.shape.pricingType;

/** The members of a price that the catalogue keeps, checked against the contract. */
const catalogPriceSchema = zPrice.pick({
  billingModel: true,
  billingPeriod: true,
  billingTiming: true,
  currency: true,
  displayLabel: true,
  displayOrder: true,
  id: true,
  isDefault: true,
  status: true,
  unitAmountDecimal: true,
});

/** The GraphQL API sends `null` for a member a price does not have; the contract leaves it out. */
const withoutNulls = <T extends object>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, member]) => member !== null),
  );

/**
 * A price of the document as the contract has it, or nothing when one of its enums is
 * not the contract's: a price whose model, timing, period or status the console cannot
 * read cannot be offered or summed up, and is not guessed at. A metered price keeps the
 * entitlement it measures and the units in a sale unit.
 */
export function toCatalogPrice(input: CatalogPriceInput): CatalogPrice | null {
  const price = catalogPriceSchema.safeParse(
    withoutNulls({
      billingModel: input.billingModel,
      billingPeriod: input.billingPeriod,
      billingTiming: input.billingTiming,
      currency: input.currency,
      displayLabel: input.displayLabel,
      displayOrder: input.displayOrder,
      id: input.id,
      isDefault: input.isDefault,
      status: input.status,
      unitAmountDecimal: input.unitAmountDecimal,
    }),
  );
  if (!price.success) {
    return null;
  }
  if (input.meteredEntitlement === null) {
    return price.data;
  }
  const metered = zPriceMeter.safeParse({
    entitlementSlug: input.meteredEntitlement,
    saleUnitFactor: input.saleUnitFactor ?? '1',
  });

  return metered.success
    ? { ...price.data, metered: metered.data }
    : price.data;
}

/** A license version of the document with the prices it can read, and the states it knows. */
export function toLicenseWithPrices(
  input: LicenseWithPricesInput,
): LicenseWithPrices {
  const lifecycleState = lifecycleStateSchema.safeParse(input.lifecycleState);
  const pricingType = pricingTypeSchema.safeParse(input.pricingType);

  return {
    id: input.id,
    lifecycleState: lifecycleState.success ? lifecycleState.data : undefined,
    name: input.name,
    pricingType: pricingType.success ? pricingType.data : undefined,
    prices: input.prices.flatMap((price) => {
      const catalogPrice = toCatalogPrice(price);

      return catalogPrice ? [catalogPrice] : [];
    }),
    slug: input.slug,
    version: input.version,
    versionName: input.versionName ?? undefined,
  };
}

/** The license versions of the pages of the document, with their prices. */
export function toLicensesWithPrices(
  items: readonly LicenseWithPricesInput[],
): LicenseWithPrices[] {
  return items.map(toLicenseWithPrices);
}
