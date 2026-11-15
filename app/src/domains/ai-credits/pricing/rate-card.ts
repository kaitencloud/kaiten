import type { AiUsage } from '@/api-client';

import { type PriceOutcome, priceUsage } from './price-usage';
import {
  isOwnRule,
  type LadderLevel,
  resolveLadder,
  resolveRule,
} from './resolve-ladder';
import { costPerCredit, margin } from './steering';
import type {
  AiRequestType,
  DenialReason,
  PricingModel,
  PricingRule,
  Specificity,
} from './types';
import { type VendorCostResult, vendorCost } from './vendor-cost';

/**
 * One cell of the rate card: a (licence version, pool, model, request type)
 * priced on the reference call. The grid renders it; it holds every number.
 */

export type RateCardCellState =
  /** Priced by a rule naming this model (EXACT_TYPED or EXACT_ALL). */
  | 'OWN_RULE'
  /** Priced by a wildcard (ANY_TYPED or ANY_ALL). */
  | 'INHERITED'
  /** The model authorizes nothing: archived, or not in the catalogue. */
  | 'NOT_AUTHORIZED'
  /** The version does not grant the pool; a rule may still exist. */
  | 'POOL_NOT_GRANTED'
  /** The version grants the pool and no rule prices the model: calls are refused. */
  | 'NO_RULE';

export type RateCardCellInput = {
  /** The rules of this version and pool; only ACTIVE ones count. */
  rules: readonly PricingRule[];
  model: PricingModel | null;
  requestType: AiRequestType;
  referenceUsage: AiUsage;
  /** Whether the version grants the pool (licence or add-on). */
  poolGranted: boolean;
  /** USD per credit, when known (browser-local in Tier 0). */
  creditValue?: string | null;
};

export type RateCardCell = {
  state: RateCardCellState;
  /** `MODEL_ARCHIVED` or `UNKNOWN_MODEL` when NOT_AUTHORIZED, `NO_RULE` when NO_RULE. */
  denialReason: DenialReason | null;
  deprecated: boolean;
  rule: PricingRule | null;
  specificity: Specificity | null;
  ladder: LadderLevel[];
  /** The reference call priced with SUCCESS, whenever a rule resolves. */
  price: PriceOutcome | null;
  vendorCost: VendorCostResult | null;
  /** Null when the vendor cost is unknown or partial (`costPartial`). */
  costPerCredit: string | null;
  /** Null when the vendor cost is unknown or partial (`costPartial`). */
  margin: string | null;
  /** The catalogue costs part of the reference call only: no figure is derived. */
  costPartial: boolean;
};

export type CostSteering = {
  costPerCredit: string | null;
  margin: string | null;
  /** A cost is known for part of the usage only: neither figure is given. */
  partial: boolean;
};

/**
 * The cost per credit and the margin of a priced call, from its vendor cost.
 * Both need the whole cost: a total that leaves a dimension out (an output
 * with no catalogue cost) would understate the cost and overstate the margin,
 * so a partial cost gives neither and says it is partial.
 */
export function steerOnCost(
  cost: VendorCostResult | null,
  chargedCredits: string | null,
  creditValue?: string | null,
): CostSteering {
  if (!cost?.complete) {
    return {
      costPerCredit: null,
      margin: null,
      partial: cost?.known === true,
    };
  }

  return {
    costPerCredit: costPerCredit(cost.total, chargedCredits),
    margin: margin({ vendorUsd: cost.total, chargedCredits, creditValue }),
    partial: false,
  };
}

function stateOf(
  input: RateCardCellInput,
  denialReason: DenialReason | null,
  specificity: Specificity | null,
): RateCardCellState {
  if (denialReason === 'UNKNOWN_MODEL' || denialReason === 'MODEL_ARCHIVED') {
    return 'NOT_AUTHORIZED';
  }
  if (!input.poolGranted) {
    return 'POOL_NOT_GRANTED';
  }
  if (specificity === null) {
    return 'NO_RULE';
  }

  return isOwnRule(specificity) ? 'OWN_RULE' : 'INHERITED';
}

export function buildRateCardCell(input: RateCardCellInput): RateCardCell {
  const ladder = resolveLadder(input.rules, input.model, input.requestType);
  const state = stateOf(input, ladder.denialReason, ladder.specificity);
  const price = ladder.winner
    ? priceUsage(ladder.winner, input.referenceUsage, 'SUCCESS')
    : null;
  const cost = input.model
    ? vendorCost(input.model.vendorCosts, input.referenceUsage)
    : null;
  const charged = price?.ok ? price.charged : null;
  const steering = steerOnCost(cost, charged, input.creditValue);

  return {
    state,
    denialReason: state === 'POOL_NOT_GRANTED' ? null : ladder.denialReason,
    deprecated: ladder.warnings.includes('MODEL_DEPRECATED'),
    rule: ladder.winner,
    specificity: ladder.specificity,
    ladder: ladder.levels,
    price,
    vendorCost: cost,
    costPerCredit: steering.costPerCredit,
    margin: steering.margin,
    costPartial: steering.partial,
  };
}

/**
 * The catalogue models a wildcard rule prices today for one request type: it
 * wins their resolution. Archived models are never covered; models added later
 * will be, which the UI says in words.
 */
export function wildcardCoverage<Item extends PricingModel>(
  wildcard: PricingRule,
  rules: readonly PricingRule[],
  models: readonly Item[],
  requestType: AiRequestType,
): Item[] {
  return models.filter(
    (model) => resolveRule(rules, model, requestType)?.rule.id === wildcard.id,
  );
}
