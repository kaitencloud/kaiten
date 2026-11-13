import type { Model } from '@/api-client';
import {
  type AiRequestType,
  modelShowsRequestType,
  type PricingRule,
  resolveLadder,
  SPECIFICITIES,
  specificityOf,
  type Specificity,
  wildcardCoverage,
} from '../engine';
import { type RateCardVersion, wildcardOf } from '../rate-card-model';
import type { LadderRow } from './ladder-view';

/** What the panel is doing to a level of the ladder, if anything. */
export type LadderFocus =
  | { kind: 'none' }
  | { kind: 'editing'; ruleId: string }
  | { kind: 'new'; level: Specificity };

const WILDCARD_LEVELS: readonly Specificity[] = ['ANY_TYPED', 'ANY_ALL'];

/** The two wildcard levels of a version, for the "Any model" cell. */
export function wildcardLadder(
  version: RateCardVersion,
  type: AiRequestType,
  focus: LadderFocus,
): LadderRow[] {
  const applying = wildcardOf(version.rules, type);

  return WILDCARD_LEVELS.map((specificity): LadderRow => {
    const rule =
      version.rules.find(
        (item) =>
          item.modelSlug == null &&
          specificityOf(item) === specificity &&
          (item.requestType == null || item.requestType === type),
      ) ?? null;
    if (focus.kind === 'new' && focus.level === specificity) {
      return { specificity, rule: null, marker: 'NEW' };
    }
    if (rule === null) {
      return { specificity, rule, marker: 'EMPTY' };
    }
    if (focus.kind === 'editing' && focus.ruleId === rule.id) {
      return { specificity, rule, marker: 'EDITING' };
    }

    return {
      specificity,
      rule,
      marker: rule.id === applying?.id ? 'APPLIES' : 'RULE',
    };
  });
}

/** The four levels a model's call is resolved through on a version. */
export function modelLadder(
  version: RateCardVersion,
  model: Model,
  type: AiRequestType,
  focus: LadderFocus,
): LadderRow[] {
  return resolveLadder(version.rules, model, type).levels.map(
    (level): LadderRow =>
      focus.kind === 'new' && focus.level === level.specificity
        ? { specificity: level.specificity, rule: null, marker: 'NEW' }
        : {
            specificity: level.specificity,
            rule: level.rule,
            marker: level.state,
          },
  );
}

const rank = (specificity: Specificity | null) =>
  specificity === null
    ? SPECIFICITIES.length
    : SPECIFICITIES.indexOf(specificity);

/**
 * The models a wildcard prices for this request type: those it wins the
 * resolution of today, for an existing rule; for one being created on `level`,
 * those nothing more specific prices. Archived models are never priced.
 */
export function wildcardScope(
  version: RateCardVersion,
  models: readonly Model[],
  type: AiRequestType,
  target: { rule: PricingRule } | { level: Specificity },
): Model[] {
  const shown = models.filter((model) => modelShowsRequestType(model, type));
  if ('rule' in target) {
    return wildcardCoverage(target.rule, version.rules, shown, type);
  }

  return shown.filter(
    (model) =>
      model.status !== 'ARCHIVED' &&
      rank(resolveLadder(version.rules, model, type).specificity) >
        rank(target.level),
  );
}
