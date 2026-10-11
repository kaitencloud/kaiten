import type { TFunction } from 'i18next';
import type { Entitlement, Price, PriceMeter } from '@/api-client';
import { getHighestAcceptedUsage } from '@/domains/entitlement-usage';
import { generateSlug } from '@/functionals/slug';
import type { PriceMeterMember } from './price-display';
import { RESET_PERIOD_UNIT_KEYS } from './price-labels';
import type { BillingModel, ResetPeriod } from './price-types';

/**
 * What a metered price measures, and what the form that creates one offers to measure.
 * A license version and an add-on version sell metered prices by the same rules (a
 * flow of an entitlement the version grants, one price a meter), so the pieces that
 * read them are here and not in the feature that edits one.
 */

/** A metered price rates what an entitlement measured; a flat fee bills a period. */
export const isMeteredModel = (model: BillingModel) => model !== 'FLAT_FEE';

/**
 * The slug a price addresses an entitlement by. The API returns one for every
 * entitlement; when a read leaves it out, it is made as the API makes it, from the
 * name.
 */
export const getEntitlementSlug = (entitlement: Entitlement): string =>
  entitlement.slug?.trim() || generateSlug(entitlement.name);

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

/**
 * A grant of a version as the meter reads it: the entitlement it grants and, for a
 * number, the limit and the overage above it. A license grant and an add-on grant both
 * have this shape.
 */
export type MeterGrant = {
  entitlementSlug?: string;
  limitCapExceededOveragePercent?: number;
  value: { [key: string]: unknown };
};

/** The limit a grant accepts usage above, and the cap it accepts usage up to. */
export type GrantAllowance = { cap: number; limit: number };

/**
 * What an overage price bills against: the limit the version grants and the most
 * its enforcement accepts above it. A grant that is unlimited has no limit to
 * exceed, and a hard one rejects what exceeds it, so neither has an allowance:
 * an overage price on it could never bill.
 */
export function getGrantAllowance(
  grant: MeterGrant | undefined,
): GrantAllowance | undefined {
  if (!grant || grant.value.type !== 'number') {
    return undefined;
  }
  const limit = grant.value.value;
  if (typeof limit !== 'number') {
    return undefined;
  }
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
  /** The cadence usage resets on; absent on a stock. */
  resetPeriod?: ResetPeriod;
};

/**
 * Who sets the allowance an overage price bills above. A `license` version's own grant
 * does: one that is hard or unlimited can never be exceeded, so an overage price on it
 * could never bill. An `instance` is what an add-on's overage is measured against: its
 * grant adds to the license's and may inherit the license's percent, so the grant alone
 * cannot say whether the overage is reachable, and the allowance is the instance's.
 */
export type OverageScope = 'instance' | 'license';

/** What the form of a price reads of the version to offer what it may meter. */
export type PriceMeterSource = {
  /** The price being edited, which keeps the meter it already has. */
  editingPriceId?: string;
  entitlements: readonly Entitlement[];
  /** What the version grants. */
  grants: readonly MeterGrant[];
  overage: OverageScope;
  prices: readonly Price[];
};

type MeterOptionsInput = PriceMeterSource & { model: BillingModel };

const isActive = (price: Pick<Price, 'status'>) => price.status === 'ACTIVE';

/**
 * What the picker of a metered price lists, computed from what the version
 * grants, with no request of its own. Only a flow is metered: an entitlement of
 * a number type, counted or summed, that resets. A number that never resets is
 * a stock (seats, storage): it is listed, disabled, so that the way to sell it,
 * as an add-on, can be said where it is looked for. A flag, a configuration or
 * a figure that is averaged, minimum or latest cannot be rated and is not
 * listed. An entitlement already metered by an active price is not offered a
 * second time, and an overage price on a license version needs a grant whose
 * overage can be reached.
 */
export function getMeterOptions({
  editingPriceId,
  entitlements,
  grants,
  model,
  overage,
  prices,
}: MeterOptionsInput): MeterOption[] {
  const grantBySlug = new Map(
    grants.flatMap((grant) =>
      grant.entitlementSlug ? [[grant.entitlementSlug, grant] as const] : [],
    ),
  );
  const metered = new Set(
    prices
      .filter(
        (price) =>
          isActive(price) &&
          price.id !== editingPriceId &&
          Boolean(price.metered),
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
    const base = { entitlement, entitlementSlug };
    if (entitlement.resetPeriod === undefined) {
      return [{ ...base, disabledReason: 'stock' }];
    }
    // A number defaults to a sum.
    const aggregation = entitlement.aggregationMethod ?? 'SUM';
    if (aggregation !== 'SUM' && aggregation !== 'COUNT') {
      return [];
    }
    const allowance =
      overage === 'license' ? getGrantAllowance(grant) : undefined;

    return [
      {
        ...base,
        allowance,
        disabledReason:
          overage === 'license' &&
          model === 'OVERAGE' &&
          allowance === undefined
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

/** The picker's options for a shape: flows first, then the stocks, disabled. */
export const meterOptionsFor = (
  source: PriceMeterSource,
  model: BillingModel,
): MeterOption[] => sortMeterOptions(getMeterOptions({ ...source, model }));

/** The option that can be picked for `slug`, if there is one. */
export const pickableOption = (options: MeterOption[], slug: string) =>
  options.find(
    (option) =>
      option.entitlementSlug === slug && option.disabledReason === undefined,
  );

type MeterLabels = Pick<
  Entitlement,
  'aggregationMethod' | 'name' | 'resetPeriod' | 'unitPlural'
>;

/**
 * What an overage bills against, in words: "Bills above 100,000 traces/month, up
 * to 200,000". The allowance is the limit the version grants and the most its
 * enforcement accepts above it.
 */
export function describeAllowance(
  allowance: GrantAllowance,
  entitlement: Pick<Entitlement, 'name' | 'unitPlural'> | undefined,
  period: string,
  slug: string,
  t: TFunction,
  locale: string,
): string {
  return t('Features.Billing.Price.Meter.overage', {
    cap: allowance.cap.toLocaleString(locale),
    limit: allowance.limit.toLocaleString(locale),
    period,
    unit: entitlement?.unitPlural ?? entitlement?.name ?? slug,
  });
}

/**
 * What a usage price counts and when the count starts again. Only a sum or a
 * count is metered; a number is summed unless it says it is counted.
 */
export function describeUsage(
  entitlement: Pick<Entitlement, 'aggregationMethod'> | undefined,
  period: string,
  t: TFunction,
): string {
  return entitlement?.aggregationMethod === 'COUNT'
    ? t('Features.Billing.Price.Meter.usageCount', { period })
    : t('Features.Billing.Price.Meter.usageSum', { period });
}

/**
 * What a metered price measures, in a line under its entitlement. An overage
 * price states the allowance and the cap it bills against ("Bills above 100,000
 * traces/month, up to 200,000"), since that is what decides what it ever bills;
 * a usage price says what it counts and when the count starts again. The overage of
 * an add-on has no allowance of its own to state: it bills above what the instance
 * holds, the license and its add-ons together.
 */
export function describeMeter(
  price: Pick<Price, 'billingModel'> & PriceMeterMember,
  entitlement: MeterLabels | undefined,
  grant: MeterGrant | undefined,
  t: TFunction,
  locale: string,
  scope: OverageScope = 'license',
): string | undefined {
  if (!price.metered) {
    return undefined;
  }
  const period = entitlement?.resetPeriod
    ? t(RESET_PERIOD_UNIT_KEYS[entitlement.resetPeriod])
    : undefined;
  if (price.billingModel === 'OVERAGE') {
    if (scope === 'instance') {
      return t('Features.Billing.Price.Meter.overageInstance');
    }
    const allowance = getGrantAllowance(grant);

    return allowance && period
      ? describeAllowance(
          allowance,
          entitlement,
          period,
          price.metered.entitlementSlug,
          t,
          locale,
        )
      : t('Features.Billing.Price.Meter.overageUnknown');
  }

  return period ? describeUsage(entitlement, period, t) : undefined;
}
