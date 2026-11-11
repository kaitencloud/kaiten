import type { Model } from '@/api-client';
import { compare, parseDecimal } from '../pricing/decimal';
import { buildRateCardCell } from '../pricing/rate-card';
import {
  DEFAULT_REFERENCE_CALLS,
  requestTypesForModality,
} from '../pricing/reference-calls';
import type { AiRequestType } from '../pricing/types';
import type {
  RateCardGrant,
  RateCardLicense,
  RateCardRule,
} from './rate-card-query';

/**
 * What one credit pool looks like on each licence version: the grant, the rules
 * that price it and what a credit costs across the models. Read-only: the rate
 * card is where the rules are edited. Pure: no React, no I/O, no copy.
 */

export type PoolGrant =
  | { kind: 'NOT_GRANTED' }
  | { kind: 'UNLIMITED' }
  | { kind: 'HARD_LIMIT'; value: number }
  | { kind: 'OVERAGE'; value: number; percent: number; maximum: number };

export type ModelCostPerCredit = {
  modelSlug: string;
  modelName: string;
  /** USD per credit, the engine's decimal string. */
  costPerCredit: string;
};

export type PoolVersionSummary = {
  licenseSlug: string;
  name: string;
  versionName: string | null;
  version: string;
  lifecycleState: RateCardLicense['lifecycleState'];
  familySlug: string;
  grant: PoolGrant;
  rulesCount: number;
  /** The request type of each wildcard rule (null: any type). */
  wildcards: (AiRequestType | null)[];
  modelsPriced: number;
  /** Among the models whose whole reference call the catalogue costs. */
  cheapest: ModelCostPerCredit | null;
  dearest: ModelCostPerCredit | null;
  /** Priced models left out of the range: the catalogue costs part of their call only. */
  partialCosts: number;
  /** Grants the pool with no rule: every call is refused. */
  noRule: boolean;
  /** Rules on a version that does not grant the pool. */
  pricedNotGranted: boolean;
  /**
   * An add-on version compatible with the family grants the pool: instances on
   * this version can hold it without the licence granting it. Known from the
   * rules, so false on a version that has none for the pool.
   */
  grantedByAddons: boolean;
  /** Archived versions still price the instances that run on them. */
  archived: boolean;
};

export function poolGrantOf(grant: RateCardGrant | undefined): PoolGrant {
  if (!grant) return { kind: 'NOT_GRANTED' };
  const percent = grant.limitCapExceededOveragePercent;
  if (grant.unlimited || percent === -1) return { kind: 'UNLIMITED' };
  const raw = (grant.value as { value?: unknown }).value;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return { kind: 'UNLIMITED' };
  if (!percent || percent <= 0) return { kind: 'HARD_LIMIT', value };
  return {
    kind: 'OVERAGE',
    value,
    percent,
    // Not rounded: the API gates on `limit × (1 + percent ÷ 100)` as it is,
    // and the instance's AI usage tab shows the same figure.
    maximum: (value * (100 + percent)) / 100,
  };
}

/** The request type a model is compared on: the first its modality shows. */
export function referenceRequestType(
  model: Pick<Model, 'modality'>,
): AiRequestType {
  return requestTypesForModality(model.modality)[0] ?? 'COMPLETION';
}

function priceModels(rules: readonly RateCardRule[], models: readonly Model[]) {
  let modelsPriced = 0;
  let partialCosts = 0;
  const costs: ModelCostPerCredit[] = [];
  for (const model of models) {
    if (model.status === 'ARCHIVED') continue;
    const requestType = referenceRequestType(model);
    const cell = buildRateCardCell({
      rules,
      model,
      requestType,
      referenceUsage: DEFAULT_REFERENCE_CALLS[requestType],
      poolGranted: true,
    });
    if (!cell.rule) continue;
    modelsPriced += 1;
    // A partial cost understates the cost per credit: it is not ranked.
    if (cell.costPartial) partialCosts += 1;
    if (cell.costPerCredit !== null)
      costs.push({
        modelSlug: model.slug,
        modelName: model.name,
        costPerCredit: cell.costPerCredit,
      });
  }
  costs.sort((left, right) =>
    compare(
      parseDecimal(left.costPerCredit)!,
      parseDecimal(right.costPerCredit)!,
    ),
  );
  return {
    modelsPriced,
    cheapest: costs[0] ?? null,
    dearest: costs.at(-1) ?? null,
    partialCosts,
  };
}

function summariseVersion(
  license: RateCardLicense,
  poolSlug: string,
  models: readonly Model[],
): PoolVersionSummary {
  const grant = poolGrantOf(
    license.entitlements.find((item) => item.entitlementSlug === poolSlug),
  );
  const rules = license.conversionRules.filter(
    (rule) => rule.entitlementSlug === poolSlug && rule.status === 'ACTIVE',
  );
  const granted = grant.kind !== 'NOT_GRANTED';
  return {
    licenseSlug: license.slug,
    name: license.name,
    versionName: license.versionName,
    version: license.version,
    lifecycleState: license.lifecycleState,
    familySlug: license.family.slug,
    grant,
    rulesCount: rules.length,
    wildcards: rules
      .filter((rule) => rule.modelSlug === null)
      .map((rule) => rule.requestType ?? null),
    ...priceModels(rules, models),
    noRule: granted && rules.length === 0,
    pricedNotGranted: !granted && rules.length > 0,
    grantedByAddons: rules.some((rule) => rule.grantedByAddons),
    archived: license.lifecycleState === 'ARCHIVED',
  };
}

/**
 * One row per licence version that grants the pool or carries rules for it, in
 * the order of the read (family, then version). A version that does neither has
 * nothing to say about this pool and is left out.
 */
export function summarisePoolPricing(
  licenses: readonly RateCardLicense[],
  poolSlug: string,
  models: readonly Model[],
): PoolVersionSummary[] {
  return licenses
    .map((license) => summariseVersion(license, poolSlug, models))
    .filter((row) => row.grant.kind !== 'NOT_GRANTED' || row.rulesCount > 0);
}
