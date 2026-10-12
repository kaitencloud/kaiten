import type {
  EntitlementUsage,
  LicenseEntitlement,
  Provenance,
} from '@/api-client';
import type { AddonContribution } from './billing-instance-addons';
import type { BoostContribution } from './billing-vouchers';

/** The id the provenance gives to the grant of a license: the mocks have none of their own. */
const licenseEntitlementId = (grant: LicenseEntitlement) =>
  `${grant.licenseSlug}-${grant.entitlementSlug}`;

/**
 * The provenance of an entitlement that nothing but the license grants, which the API
 * serves for every row: the license's grant, no add-on, no voucher, and no composition.
 * The OpenAPI document declares the `number` required and never null; the API sends null.
 */
export function identityProvenance(grant: LicenseEntitlement): Provenance {
  return {
    addons: [],
    boosts: [],
    license: {
      licenseEntitlementId: licenseEntitlementId(grant),
      limitCapExceededOveragePercent:
        grant.value.type === 'number'
          ? (grant.limitCapExceededOveragePercent ?? null)
          : null,
      value: grant.value,
    },
    number: null,
  } as unknown as Provenance;
}

/**
 * What the API composes for a number the license grants, from what the instance holds:
 * the effective value and overage percent, and the provenance that says how (the
 * Go oracle of `api/internal/modules/entitlements/effective`, for the mocks).
 *
 * The order is the API's: an OVERRIDE add-on replaces the license's value (the latest
 * attached counts), a MAX keeps the larger, an ADD adds `value × quantity`; then the
 * boosts, where the latest SET takes the place of all of that, the ADD boosts add to it
 * and the MULTIPLY boosts multiply the sum. An unlimited boost makes it unlimited. A boost
 * never changes the percent; the latest attached add-on that sets its own wins, else the
 * license's, else the limit is hard.
 *
 * The OpenAPI document declares the `license` and the `number` of a provenance as never
 * null, while the API sends null for a number nothing but the license grants (the
 * identity case). The mock answers as the API does, hence the cast.
 */
export function composeEffectiveNumber(
  grant: LicenseEntitlement & { value: { type: 'number'; value: number } },
  contributions: readonly AddonContribution[],
  boosts: readonly BoostContribution[],
): Pick<
  EntitlementUsage,
  'limit' | 'limitCapExceededOveragePercent' | 'provenance' | 'source'
> {
  const override = contributions
    .filter(({ behavior }) => behavior === 'OVERRIDE')
    .at(-1);
  let afterAddons = override
    ? override.value * override.quantity
    : grant.value.value;
  for (const { behavior, quantity, value } of contributions) {
    if (behavior === 'MAX') {
      afterAddons = Math.max(afterAddons, value * quantity);
    }
  }
  for (const { behavior, quantity, value } of contributions) {
    if (behavior === 'ADD') {
      afterAddons += value * quantity;
    }
  }

  const modifiers = (type: BoostContribution['modifierType']) =>
    boosts.filter(({ modifierType }) => modifierType === type);
  const boostSet = modifiers('SET').at(-1)?.value ?? null;
  const adds = modifiers('ADD');
  const multiplies = modifiers('MULTIPLY');
  const boostAdd = adds.length
    ? adds.reduce((sum, { value }) => sum + (value ?? 0), 0)
    : null;
  const boostMultiply = multiplies.length
    ? multiplies.reduce((product, { value }) => product * (value ?? 1), 1)
    : null;
  const unlimited = modifiers('UNLIMITED').length > 0;
  const effective = unlimited
    ? -1
    : ((boostSet ?? afterAddons) + (boostAdd ?? 0)) * (boostMultiply ?? 1);

  const ownPercent = contributions
    .filter(({ overagePercent }) => overagePercent !== undefined)
    .at(-1)?.overagePercent;
  const licensePercent = grant.limitCapExceededOveragePercent ?? 0;
  const percent = unlimited ? -1 : (ownPercent ?? licensePercent);

  const provenance = {
    addons: contributions.map((contribution) => ({
      addonEntitlementId: contribution.addonEntitlementId,
      addonId: contribution.addonId,
      attachedAt: contribution.attachedAt,
      instanceAddonId: contribution.instanceAddonId,
      limitCapExceededOveragePercent: contribution.overagePercent ?? null,
      overrideBehavior: contribution.behavior,
      quantity: contribution.quantity,
      value: { type: 'number', value: contribution.value },
    })),
    boosts: boosts.map((boost) => ({
      effectiveExpiresAt: boost.effectiveExpiresAt ?? null,
      effectiveStartsAt: boost.effectiveStartsAt,
      instanceVoucherId: boost.instanceVoucherId,
      modifierType: boost.modifierType,
      modifierValue: boost.value ?? null,
      redeemedAt: boost.redeemedAt,
      voucherEntitlementGrantId: boost.voucherEntitlementGrantId,
      voucherId: boost.voucherId,
    })),
    license: {
      licenseEntitlementId: licenseEntitlementId(grant),
      limitCapExceededOveragePercent:
        grant.limitCapExceededOveragePercent ?? null,
      value: { type: 'number', value: grant.value.value },
    },
    number:
      contributions.length + boosts.length === 0
        ? null
        : {
            afterAddons,
            boostAdd,
            boostMultiply,
            boostSet,
            effective,
            license: grant.value.value,
            unlimited,
          },
  };

  return {
    limit: { type: 'number', value: effective },
    limitCapExceededOveragePercent: percent,
    provenance: provenance as unknown as Provenance,
    source: 'license',
  };
}
