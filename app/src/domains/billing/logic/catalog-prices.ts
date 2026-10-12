import type { Addon, License } from '@/api-client';
import type { GetCatalogPricesQuery } from '@/api-client/graphql/graphql';
import { zAddon, zLicense } from '@/api-client/zod.gen';
import { type CatalogPrice, toCatalogPrice } from './license-catalogue';

type LicenseItem = NonNullable<
  GetCatalogPricesQuery['licenses']
>['items'][number];
type AddonItem = NonNullable<GetCatalogPricesQuery['addons']>['items'][number];

/** What `GetCatalogPrices` sends of a license version and of an add-on version. */
export type CatalogLicenseInput = LicenseItem;
export type CatalogAddonInput = AddonItem;

/**
 * A license version or an add-on version with every price it has, ACTIVE or DEPRECATED,
 * in the order the API lists them. The API gives a price no owner, so the owner is the
 * version the prices were read under. `lifecycleState` is `undefined` for a state this
 * console does not know, so that the screens that name the version never meet a state
 * they have no label for; a price it cannot read is dropped (`toCatalogPrice`).
 */
export type VersionWithPrices =
  | {
      id: string;
      kind: 'ADDON';
      lifecycleState: Addon['lifecycleState'] | undefined;
      name: string;
      prices: CatalogPrice[];
      versionName: string;
    }
  | {
      id: string;
      kind: 'LICENSE';
      lifecycleState: License['lifecycleState'] | undefined;
      name: string;
      prices: CatalogPrice[];
      version: string;
    };

const licenseStateSchema = zLicense.shape.lifecycleState;
const addonStateSchema = zAddon.shape.lifecycleState;

const toPrices = (
  inputs: readonly Parameters<typeof toCatalogPrice>[0][],
): CatalogPrice[] =>
  inputs.flatMap((input) => {
    const price = toCatalogPrice(input);

    return price ? [price] : [];
  });

/** A license version of the document, with the prices and the state the console reads. */
export function toLicenseVersionWithPrices(
  input: CatalogLicenseInput,
): VersionWithPrices {
  const lifecycleState = licenseStateSchema.safeParse(input.lifecycleState);

  return {
    id: input.id,
    kind: 'LICENSE',
    lifecycleState: lifecycleState.success ? lifecycleState.data : undefined,
    name: input.name,
    prices: toPrices(input.prices),
    version: input.version,
  };
}

/** An add-on version of the document, with the prices and the state the console reads. */
export function toAddonVersionWithPrices(
  input: CatalogAddonInput,
): VersionWithPrices {
  const lifecycleState = addonStateSchema.safeParse(input.lifecycleState);

  return {
    id: input.id,
    kind: 'ADDON',
    lifecycleState: lifecycleState.success ? lifecycleState.data : undefined,
    name: input.name,
    prices: toPrices(input.prices),
    versionName: input.versionName,
  };
}

/** Every version of the pages of the document: the license versions, then the add-ons'. */
export function toVersionsWithPrices({
  addons,
  licenses,
}: {
  addons: readonly CatalogAddonInput[];
  licenses: readonly CatalogLicenseInput[];
}): VersionWithPrices[] {
  return [
    ...licenses.map(toLicenseVersionWithPrices),
    ...addons.map(toAddonVersionWithPrices),
  ];
}
