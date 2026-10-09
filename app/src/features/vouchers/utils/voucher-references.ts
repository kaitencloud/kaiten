import type { TFunction } from 'i18next';
import type { Addon, Customer, Entitlement, License } from '@/api-client';
import { getAddonTitle } from '@/domains/billing';
import type { VoucherNames } from '../types';

/**
 * What a license version is called where it is chosen or written out: the versions of a
 * product share a name, so the number tells them apart, and a version that is not on sale
 * says what it is.
 */
export function getLicenseLabel(
  license: Pick<License, 'lifecycleState' | 'name' | 'version'>,
  t: TFunction,
): string {
  const label = t('Pages.Vouchers.References.license', {
    name: license.name,
    version: license.version,
  });

  switch (license.lifecycleState) {
    case 'DRAFT':
      return t('Pages.Vouchers.References.draft', { label });
    case 'ARCHIVED':
      return t('Pages.Vouchers.References.archived', { label });
    default:
      return label;
  }
}

/** An add-on version, with the state it is in when it is not on sale. */
export function getAddonLabel(
  addon: Pick<Addon, 'lifecycleState' | 'name' | 'versionName'>,
  t: TFunction,
): string {
  const label = getAddonTitle(addon);

  switch (addon.lifecycleState) {
    case 'DRAFT':
      return t('Pages.Vouchers.References.draft', { label });
    case 'ARCHIVED':
      return t('Pages.Vouchers.References.archived', { label });
    default:
      return label;
  }
}

const byId = <T extends { id: string }>(
  items: readonly T[],
  label: (item: T) => string,
): Record<string, string> =>
  Object.fromEntries(items.map((item) => [item.id, label(item)]));

/**
 * The names of customers by slug: the one place the mapping is made, for the screens
 * that write a reservation out and the wizard that offers one. A customer with no slug
 * has nothing a voucher could name it by.
 */
export const toCustomerNames = (
  customers: readonly Pick<Customer, 'name' | 'slug'>[],
): Record<string, string> =>
  Object.fromEntries(
    customers.flatMap((customer) =>
      customer.slug ? [[customer.slug, customer.name]] : [],
    ),
  );

/** The names of what a voucher refers to, from what the console read of the organization. */
export function buildVoucherNames({
  addons = [],
  customers = [],
  entitlements = [],
  licenses = [],
  prices = {},
  t,
}: {
  addons?: readonly Addon[];
  customers?: readonly Customer[];
  entitlements?: readonly Entitlement[];
  licenses?: readonly License[];
  prices?: Readonly<Record<string, string>>;
  t: TFunction;
}): VoucherNames {
  return {
    addons: byId(addons, (addon) => getAddonLabel(addon, t)),
    customers: toCustomerNames(customers),
    entitlements: Object.fromEntries(
      entitlements.flatMap((entitlement) =>
        entitlement.slug ? [[entitlement.slug, entitlement.name]] : [],
      ),
    ),
    licenses: byId(licenses, (license) => getLicenseLabel(license, t)),
    prices,
  };
}

/**
 * Whether a boost can change an entitlement: only the numeric ones have a value to set,
 * add to or multiply (`CreateVoucher.InvalidGrant` refuses the others).
 */
export const isBoostable = (entitlement: Pick<Entitlement, 'type'>): boolean =>
  entitlement.type === 'NUMBER' || entitlement.type === 'NUMBER_AI_CREDIT';
