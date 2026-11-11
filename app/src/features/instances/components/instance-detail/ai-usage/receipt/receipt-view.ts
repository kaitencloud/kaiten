import type { AiInference, AiInferenceRefund, Model } from '@/api-client';
import {
  type DenialReason,
  type PricingRule,
  type ReceiptReconstruction,
  findModelByRef,
  reconstructReceipt,
  refundableCredits,
} from '../engine';
import { costOf, type ReceiptCostView } from './receipt-cost-view';
import { type RuleToday, ruleTodayOf } from './receipt-rule-today';
import { type ChangedTerms, changedTerms } from './receipt-terms';
import { addDecimalStrings } from '@/lib/decimal';

/**
 * Everything a charge receipt shows, derived from the stored row, the rule
 * read on the row's licence version, the catalogue and the pool. Pure: no React, no fetch, no
 * text. The stored facts come first; a recomputation is only ever the engine's
 * `reconstructReceipt`, which says itself whether it may be shown.
 */

export type ReceiptKind =
  /** Committed and authorized: a charge, possibly zero. */
  | 'COMMITTED'
  /** No rule priced it (no rule, unknown or archived model): zero credits. */
  | 'UNAUTHORIZED'
  /** Released before the call was sent: zero credits. */
  | 'RELEASED'
  /** The hold lapsed with no commit: zero credits. */
  | 'EXPIRED'
  /** Still held, not committed yet. */
  | 'OPEN';

export type ReceiptPool = {
  slug: string;
  name: string;
  /** The pool's current licence version (usage read). */
  licenseSlug: string | null;
  limit: number | null;
  maximum: number | null;
};

export type ReceiptViewInput = {
  inference: AiInference;
  /** The rule fetched by `conversionRuleId`; null when not found or none. */
  rule: PricingRule | null;
  /** The rule could not be read (no scope): `rule` is null and says nothing. */
  ruleUnread?: boolean;
  /** The catalogue; empty when it could not be read (`catalogueUnread`). */
  models: readonly Model[];
  /** The catalogue could not be read (no scope): no model is named or costed. */
  catalogueUnread?: boolean;
  pool: ReceiptPool;
  /** The pool's credit value saved in this browser, if any. */
  creditValue: string | null;
};

export type ReceiptView = {
  kind: ReceiptKind;
  inference: AiInference;
  model: Model | null;
  /** How the sent reference found the model: its slug or one of its external ids. */
  matchedBy: 'SLUG' | 'EXTERNAL_ID' | null;
  /**
   * The call was refused for an unknown model, and the catalogue knows the
   * name today: it was added since, as a slug or an external id. The row stays
   * as recorded; calls sent now resolve.
   */
  knownSince: boolean;
  denialReason: DenialReason | null;
  /**
   * The licence version whose rules were considered. `ROW`: stored on the row.
   * `DELETED`: the row names a licence that no longer exists, by its id alone.
   * `CURRENT`: an older row that stores none; the pool's current version.
   */
  licence: ReceiptLicence | null;
  pool: ReceiptPool;
  /** The arithmetic, for a committed and authorized row; null otherwise. */
  pricing: ReceiptReconstruction | null;
  /** The catalogue could not be read: `model` is null and says nothing. */
  catalogueUnread: boolean;
  /** What the rule of a snapshot is today; null for a row without a snapshot. */
  ruleToday: RuleToday | null;
  /** The current rule was read and compared with the snapshot. */
  ruleCompared: boolean;
  /** The current rule differs from the rates the snapshot applied. */
  editedSince: boolean;
  /** The rule's terms as they are now, where they differ from the snapshot's. */
  currentTerms: ChangedTerms | null;
  effect: {
    reserved: string | null;
    /** Reserved minus charged, when the hold covered the charge. */
    givenBack: string | null;
    /** Charged minus reserved, when the commit drew more than the hold. */
    drawnAbove: string | null;
  };
  /** What was given back since the commit; null when the row is not a charge. */
  refund: ReceiptRefund | null;
  cost: ReceiptCostView | null;
  warnings: string[];
};

export type { ReceiptCostView, RuleToday };

export type ReceiptLicence =
  | { source: 'ROW' | 'CURRENT'; slug: string; id: string | null }
  | { source: 'DELETED'; slug: null; id: string };

export type RefundState =
  /** Committed, charged, and something is left to give back. */
  | 'REFUNDABLE'
  /** The whole charge was refunded. */
  | 'NOTHING_LEFT'
  /** Committed and charged nothing. */
  | 'NOT_CHARGED';

export type ReceiptRefund = {
  state: RefundState;
  charged: string;
  refunded: string;
  /** `charged − refunded`, what a refund can still give back. */
  refundable: string;
  /** Oldest first, as the API lists them. */
  refunds: AiInferenceRefund[];
};

const DENIALS: readonly string[] = [
  'UNKNOWN_MODEL',
  'MODEL_ARCHIVED',
  'NO_RULE',
];

function denialOf(inference: AiInference): DenialReason | null {
  const reason = inference.denialReason;

  return reason && DENIALS.includes(reason) ? (reason as DenialReason) : null;
}

function kindOf(inference: AiInference): ReceiptKind {
  if (inference.status === 'RESERVED') {
    return 'OPEN';
  }
  if (inference.status === 'EXPIRED') {
    return 'EXPIRED';
  }
  if (inference.authorized === false || denialOf(inference)) {
    return 'UNAUTHORIZED';
  }

  return inference.status === 'RELEASED' ? 'RELEASED' : 'COMMITTED';
}

function licenceOf(
  inference: AiInference,
  pool: ReceiptPool,
): ReceiptLicence | null {
  if (inference.licenseSlug) {
    return {
      source: 'ROW',
      slug: inference.licenseSlug,
      id: inference.licenseId ?? null,
    };
  }
  // The row names a licence and the API no longer finds its slug: deleted.
  if (inference.licenseId) {
    return { source: 'DELETED', slug: null, id: inference.licenseId };
  }

  return pool.licenseSlug
    ? { source: 'CURRENT', slug: pool.licenseSlug, id: null }
    : null;
}

function refundOf(inference: AiInference): ReceiptRefund | null {
  if (inference.status !== 'COMMITTED' || inference.authorized === false) {
    return null;
  }
  const charged = inference.credits.charged ?? '0';
  const refundable = refundableCredits(inference.credits);
  const chargedNothing = refundableCredits({ charged }) === '0';

  return {
    state: chargedNothing
      ? 'NOT_CHARGED'
      : refundable === '0'
        ? 'NOTHING_LEFT'
        : 'REFUNDABLE',
    charged,
    refunded: inference.credits.refunded ?? '0',
    refundable,
    refunds: inference.refunds ?? [],
  };
}

function negate(value: string) {
  return value.startsWith('-') ? value.slice(1) : `-${value}`;
}

function poolEffect(inference: AiInference): ReceiptView['effect'] {
  const reserved = inference.credits.reserved ?? null;
  const charged =
    inference.status === 'COMMITTED' ? (inference.credits.charged ?? '0') : '0';
  if (reserved === null) {
    return { reserved, givenBack: null, drawnAbove: null };
  }
  const difference = addDecimalStrings(reserved, negate(charged));

  return difference.startsWith('-')
    ? { reserved, givenBack: null, drawnAbove: negate(difference) }
    : { reserved, givenBack: difference, drawnAbove: null };
}

export function buildReceiptView({
  inference,
  rule,
  ruleUnread = false,
  models,
  catalogueUnread = false,
  pool,
  creditValue,
}: ReceiptViewInput): ReceiptView {
  const kind = kindOf(inference);
  const model = findModelByRef(models, inference.modelSlug ?? inference.model);
  const matchedBy = model
    ? model.slug === inference.model
      ? 'SLUG'
      : 'EXTERNAL_ID'
    : null;
  const priced = kind === 'COMMITTED';
  const pricing = priced
    ? reconstructReceipt({
        inference,
        rule,
        ruleUnread,
        // A row that stores its licence is read on it; only an older row is
        // checked against the pool's current version.
        currentLicenseSlug: inference.licenseSlug ?? pool.licenseSlug,
      })
    : null;
  const ruleToday =
    pricing?.kind === 'SNAPSHOT'
      ? ruleTodayOf(inference, rule, ruleUnread)
      : null;
  const ruleCompared =
    ruleToday !== null && ruleToday !== 'UNREAD' && ruleToday !== 'NOT_FOUND';
  const editedSince = ruleToday === 'EDITED';
  const currentTerms =
    editedSince && pricing?.kind === 'SNAPSHOT' && rule !== null
      ? changedTerms(pricing.snapshot, rule)
      : null;

  return {
    kind,
    inference,
    model,
    matchedBy,
    knownSince: denialOf(inference) === 'UNKNOWN_MODEL' && model !== null,
    denialReason: denialOf(inference),
    licence: licenceOf(inference, pool),
    pool,
    pricing,
    catalogueUnread,
    ruleToday,
    ruleCompared,
    editedSince,
    currentTerms,
    refund: refundOf(inference),
    effect: poolEffect(inference),
    cost: costOf(inference, model, creditValue),
    warnings: inference.warnings ?? [],
  };
}

/** The rule a receipt is about: the snapshot's, else the row's. */
export function receiptRuleId(inference: AiInference) {
  return inference.pricing?.ruleId ?? inference.conversionRuleId ?? null;
}
