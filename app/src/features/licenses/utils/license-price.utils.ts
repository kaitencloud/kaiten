import type {
  Entitlement,
  License,
  LicenseEntitlement,
  Price,
  PriceMeter,
} from '@/api-client';
import type {
  BillingModel,
  BillingPeriod,
  ResetPeriod,
} from '@/domains/billing';
import { getHighestAcceptedUsage } from '@/domains/entitlement-usage';
import { getEntitlementSlug } from './license-entitlements.utils';
import { getLicenseLifecycleState } from './license-lifecycle.utils';

/** A metered price rates what an entitlement measured; a flat fee bills a period. */
export const isMeteredModel = (model: BillingModel) => model !== 'FLAT_FEE';

export const isActivePrice = (price: Pick<Price, 'status'>) =>
  price.status === 'ACTIVE';

/**
 * The currency a version bills in. A version has one, fixed by its first price,
 * which stays the version's whatever becomes of that price: a deprecated price
 * still counts.
 */
export const getVersionCurrency = (prices: readonly Price[]) =>
  prices[0]?.currency;

/**
 * The display order a new price takes: after the last one the version has. A
 * version with no price leaves it to the API, whose default puts the first at
 * 0. Without it the prices of a version sort by an id nobody chose.
 */
export function getNextDisplayOrder(prices: readonly Price[]) {
  return prices.length === 0
    ? undefined
    : Math.max(...prices.map((price) => price.displayOrder)) + 1;
}

/** The price a version bills as the default of one billing period, if it has one. */
export const getDefaultPrice = (
  prices: readonly Price[],
  period: BillingPeriod | undefined,
) =>
  prices.find(
    (price) =>
      price.isDefault && isActivePrice(price) && price.billingPeriod === period,
  );

/**
 * What a version lets be done to its prices, from its lifecycle state. A draft
 * is being prepared, so its prices are edited. Once it is published they are
 * immutable, and the one change left to an existing price is deprecation; a new
 * price can still be added until a subscription bills the version, which only
 * the API knows, so the console offers it and shows the refusal. An archived
 * version is withdrawn: it takes no new price.
 */
export type PriceRules = {
  canAdd: boolean;
  canEdit: boolean;
  /** Whether the version can still gain a price in the console's eyes. */
  state: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
};

export function getPriceRules(
  license: Pick<License, 'lifecycleState'>,
): PriceRules {
  const state = getLicenseLifecycleState(license);

  return {
    canAdd: state !== 'ARCHIVED',
    canEdit: state === 'DRAFT',
    state,
  };
}

export const canEditPrice = (rules: PriceRules, price: Pick<Price, 'status'>) =>
  rules.canEdit && isActivePrice(price);

export const canDeprecatePrice = (price: Pick<Price, 'status'>) =>
  isActivePrice(price);

// --- Units -------------------------------------------------------------------

/**
 * What a price created on `entitlement` would capture of it: the sale unit it
 * names, or one base unit when it names none. The API captures it once, when the
 * price is created, and never reads it again.
 */
export function meterOfEntitlement(
  entitlement: Pick<
    Entitlement,
    'saleUnitFactor' | 'saleUnitSingular' | 'slug' | 'id'
  >,
): PriceMeter {
  return {
    entitlementSlug: entitlement.slug ?? entitlement.id,
    saleUnitFactor: String(entitlement.saleUnitFactor ?? 1),
    saleUnitSingular: entitlement.saleUnitSingular,
  };
}

// --- What a price may meter --------------------------------------------------

/** The limit a grant accepts usage above, and the cap it accepts usage up to. */
export type GrantAllowance = { cap: number; limit: number };

/**
 * What an overage price bills against: the limit the version grants and the most
 * its enforcement accepts above it. A grant that is unlimited has no limit to
 * exceed, and a hard one rejects what exceeds it, so neither has an allowance:
 * an overage price on it could never bill.
 */
export function getGrantAllowance(
  grant: LicenseEntitlement | undefined,
): GrantAllowance | undefined {
  if (!grant || grant.value.type !== 'number') {
    return undefined;
  }
  const limit = grant.value.value;
  const percent = grant.limitCapExceededOveragePercent ?? 0;
  if (limit < 0 || percent <= 0) {
    return undefined;
  }
  const cap = getHighestAcceptedUsage(limit, percent);

  return cap === null ? undefined : { cap, limit };
}

export type MeterDisabledReason = 'overageUnreachable' | 'stock';

export type MeterOption = {
  allowance?: GrantAllowance;
  /** Why the option cannot be picked; absent when it can. */
  disabledReason?: MeterDisabledReason;
  entitlement: Entitlement;
  entitlementSlug: string;
  grant: LicenseEntitlement;
  /** The cadence usage resets on; absent on a stock. */
  resetPeriod?: ResetPeriod;
};

type MeterOptionsInput = {
  entitlements: readonly Entitlement[];
  /** What the version grants. */
  grants: readonly LicenseEntitlement[];
  model: BillingModel;
  /** The version's prices: an entitlement an ACTIVE price meters is not offered again. */
  prices: readonly Price[];
  /** The price being edited, which keeps the meter it already has. */
  editingPriceId?: string;
};

/**
 * What the picker of a metered price lists, computed from what the version
 * grants, with no request of its own. Only a flow is metered: an entitlement of
 * a number type, counted or summed, that resets. A number that never resets is
 * a stock (seats, storage): it is listed, disabled, so that the way to sell it,
 * as an add-on, can be said where it is looked for. A flag, a configuration or
 * a figure that is averaged, minimum or latest cannot be rated and is not
 * listed. An entitlement already metered by an active price is not offered a
 * second time, and an overage price needs a grant whose overage can be reached.
 */
export function getMeterOptions({
  editingPriceId,
  entitlements,
  grants,
  model,
  prices,
}: MeterOptionsInput): MeterOption[] {
  const grantBySlug = new Map(
    grants.map((grant) => [grant.entitlementSlug, grant]),
  );
  const metered = new Set(
    prices
      .filter(
        (price) =>
          isActivePrice(price) &&
          price.id !== editingPriceId &&
          price.metered !== undefined,
      )
      .map((price) => price.metered?.entitlementSlug),
  );

  return entitlements.flatMap((entitlement): MeterOption[] => {
    const entitlementSlug = getEntitlementSlug(entitlement);
    const grant = grantBySlug.get(entitlementSlug);
    const isNumber =
      entitlement.type === 'NUMBER' || entitlement.type === 'NUMBER_AI_CREDIT';
    if (!grant || !isNumber || metered.has(entitlementSlug)) {
      return [];
    }
    const base = { entitlement, entitlementSlug, grant };
    if (entitlement.resetPeriod === undefined) {
      return [{ ...base, disabledReason: 'stock' }];
    }
    // A number defaults to a sum.
    const aggregation = entitlement.aggregationMethod ?? 'SUM';
    if (aggregation !== 'SUM' && aggregation !== 'COUNT') {
      return [];
    }
    const allowance = getGrantAllowance(grant);

    return [
      {
        ...base,
        allowance,
        disabledReason:
          model === 'OVERAGE' && allowance === undefined
            ? 'overageUnreachable'
            : undefined,
        resetPeriod: entitlement.resetPeriod,
      },
    ];
  });
}

/** Flows first, then the stocks the picker lists disabled, each by name. */
export function sortMeterOptions(options: readonly MeterOption[]) {
  return [...options].sort(
    (left, right) =>
      Number(left.disabledReason === 'stock') -
        Number(right.disabledReason === 'stock') ||
      left.entitlement.name.localeCompare(right.entitlement.name),
  );
}
