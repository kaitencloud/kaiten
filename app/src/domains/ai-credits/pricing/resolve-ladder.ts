import {
  type AiRequestType,
  type DenialReason,
  type PricingModel,
  type PricingRule,
  SPECIFICITIES,
  type Specificity,
} from './types';

/**
 * Mirrors `aicredit.Resolve` (pricing.go) and the denial reasons of
 * `reportentitlementusagemetric/kind_ai.go`. Rules carry a model slug where
 * the server compares model ids; a slug is unique per organization, so the
 * match is the same.
 */

export type LadderLevelState =
  /** The most specific matching rule: it prices the call. */
  | 'APPLIES'
  /** A matching rule a more specific level outranks. */
  | 'SHADOWED'
  /** A matching rule that prices nothing: the model is archived or unknown. */
  | 'BLOCKED'
  /** No active rule at this level. */
  | 'EMPTY';

export type LadderLevel = {
  specificity: Specificity;
  rule: PricingRule | null;
  state: LadderLevelState;
};

export type LadderResolution = {
  /** The four levels, most specific first. */
  levels: LadderLevel[];
  winner: PricingRule | null;
  specificity: Specificity | null;
  authorized: boolean;
  denialReason: DenialReason | null;
  /** `MODEL_DEPRECATED` when the model is deprecated: still priced, flagged. */
  warnings: 'MODEL_DEPRECATED'[];
};

/** The level a rule sits on, from its identity alone (model slug, request type). */
export function specificityOf(
  rule: Pick<PricingRule, 'modelSlug' | 'requestType'>,
): Specificity {
  if (rule.modelSlug != null) {
    return rule.requestType != null ? 'EXACT_TYPED' : 'EXACT_ALL';
  }

  return rule.requestType != null ? 'ANY_TYPED' : 'ANY_ALL';
}

/** Whether a rule sits on a level that names one model (EXACT_TYPED or EXACT_ALL). */
export function isOwnRule(specificity: Specificity): boolean {
  return specificity === 'EXACT_TYPED' || specificity === 'EXACT_ALL';
}

function matches(
  rule: PricingRule,
  modelSlug: string | null,
  requestType: AiRequestType,
): boolean {
  return (
    rule.status === 'ACTIVE' &&
    (rule.modelSlug == null || rule.modelSlug === modelSlug) &&
    (rule.requestType == null || rule.requestType === requestType)
  );
}

/**
 * The winning rule, exactly as the server picks it: none for an unknown or
 * archived model, even through a wildcard; deprecated models stay priced.
 */
export function resolveRule(
  rules: readonly PricingRule[],
  model: Pick<PricingModel, 'slug' | 'status'> | null,
  requestType: AiRequestType,
): { rule: PricingRule; specificity: Specificity } | null {
  if (model === null || model.status === 'ARCHIVED') {
    return null;
  }
  let best: { rule: PricingRule; specificity: Specificity } | null = null;
  let bestRank = SPECIFICITIES.length;
  for (const rule of rules) {
    if (!matches(rule, model.slug, requestType)) {
      continue;
    }
    const specificity = specificityOf(rule);
    const rank = SPECIFICITIES.indexOf(specificity);
    if (rank < bestRank) {
      best = { rule, specificity };
      bestRank = rank;
    }
  }

  return best;
}

/** The denial the server records for this resolution, or null when authorized. */
export function denialReasonFor(
  model: Pick<PricingModel, 'status'> | null,
  ruleFound: boolean,
): DenialReason | null {
  if (model === null) {
    return 'UNKNOWN_MODEL';
  }
  if (model.status === 'ARCHIVED') {
    return 'MODEL_ARCHIVED';
  }

  return ruleFound ? null : 'NO_RULE';
}

/** The full ladder for display, plus the server's verdict. */
export function resolveLadder(
  rules: readonly PricingRule[],
  model: Pick<PricingModel, 'slug' | 'status'> | null,
  requestType: AiRequestType,
): LadderResolution {
  const resolved = resolveRule(rules, model, requestType);
  const candidates = rules.filter((rule) =>
    matches(rule, model?.slug ?? null, requestType),
  );
  let winnerSeen = false;
  const levels = SPECIFICITIES.map((specificity): LadderLevel => {
    const rule =
      candidates.find((item) => specificityOf(item) === specificity) ?? null;
    if (rule === null) {
      return { specificity, rule, state: 'EMPTY' };
    }
    if (resolved === null) {
      return { specificity, rule, state: 'BLOCKED' };
    }
    const state = winnerSeen ? 'SHADOWED' : 'APPLIES';
    winnerSeen = true;

    return { specificity, rule, state };
  });

  return {
    levels,
    winner: resolved?.rule ?? null,
    specificity: resolved?.specificity ?? null,
    authorized: resolved !== null,
    denialReason: denialReasonFor(model, resolved !== null),
    warnings: model?.status === 'DEPRECATED' ? ['MODEL_DEPRECATED'] : [],
  };
}

/**
 * The catalogue model a reported reference names, as the server looks it up:
 * the slug first, then an external id. Null when the model is unknown.
 */
export function findModelByRef<Item extends PricingModel>(
  models: readonly Item[],
  ref: string,
): Item | null {
  return (
    models.find((model) => model.slug === ref) ??
    models.find((model) => model.externalIds?.includes(ref)) ??
    null
  );
}
