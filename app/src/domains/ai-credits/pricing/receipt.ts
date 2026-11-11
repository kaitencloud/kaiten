import { sameDecimal } from './decimal';
import { type Priced, type PriceOutcome, priceUsage } from './price-usage';
import { specificityOf } from './resolve-ladder';
import type {
  AiInferenceWithSnapshot,
  AiRequestStatus,
  PricingRule,
  PricingSnapshot,
  Specificity,
} from './types';

/**
 * The arithmetic behind a stored charge. With a pricing snapshot on the row
 * (backend Tier 1) the snapshot is the authority. Without one, the rule as it
 * stands today is a reconstruction, shown only when it gives back exactly the
 * stored amounts and the rule was not edited after the commit.
 */

export type ReceiptUnavailableReason =
  /** Reserved or expired: nothing was computed at commit. */
  | 'NOT_COMMITTED'
  /** No rule priced the call (see the row's denial reason). */
  | 'NOT_AUTHORIZED'
  /** The rule is not given, or is another rule than the row's. */
  | 'RULE_NOT_FOUND'
  /** The rule could not be read (the session may not): nothing says it is gone. */
  | 'RULE_NOT_READ'
  /** The rule belongs to another licence version than the instance's current one. */
  | 'RULE_NOT_ON_CURRENT_VERSION'
  /** The rule changed after the commit: its rates may not be those applied. */
  | 'RULE_EDITED_AFTER_COMMIT'
  /** Recomputing gives other amounts than those stored. */
  | 'AMOUNT_MISMATCH'
  /** The row lacks a request status or stored amounts, or the rule does not price. */
  | 'NOT_RECOMPUTABLE';

export type ReceiptReconstruction =
  | {
      kind: 'SNAPSHOT';
      snapshot: PricingSnapshot;
      specificity: Specificity;
      price: PriceOutcome;
      /** Recomputing the snapshot gives back the stored amounts (it should). */
      agreesWithStored: boolean;
    }
  | {
      kind: 'MATCHES';
      rule: PricingRule;
      specificity: Specificity;
      price: Priced;
    }
  | {
      kind: 'CANNOT_RECONSTRUCT';
      reason: ReceiptUnavailableReason;
      rule: PricingRule | null;
      specificity: Specificity | null;
    };

export type ReceiptInput = {
  inference: AiInferenceWithSnapshot;
  /** The rule fetched by `conversionRuleId`, or null when it is not found. */
  rule: PricingRule | null;
  /** The rule could not be read at all: `rule` is null and says nothing. */
  ruleUnread?: boolean;
  /** The instance's current licence version; checked when given. */
  currentLicenseSlug?: string | null;
};

const STATUSES: readonly string[] = [
  'SUCCESS',
  'PROVIDER_ERROR',
  'CUSTOMER_ERROR',
  'NOT_SENT',
];

function requestStatusOf(
  inference: AiInferenceWithSnapshot,
): AiRequestStatus | null {
  const status = inference.requestStatus;

  return status !== undefined && STATUSES.includes(status)
    ? (status as AiRequestStatus)
    : null;
}

function matchesStored(
  price: PriceOutcome,
  inference: AiInferenceWithSnapshot,
): price is Priced {
  return (
    price.ok &&
    sameDecimal(price.computed, inference.credits.computed) &&
    sameDecimal(price.charged, inference.credits.charged)
  );
}

function unavailable(
  reason: ReceiptUnavailableReason,
  rule: PricingRule | null = null,
): ReceiptReconstruction {
  return {
    kind: 'CANNOT_RECONSTRUCT',
    reason,
    rule,
    specificity: rule ? specificityOf(rule) : null,
  };
}

function editedAfter(rule: PricingRule, committedAt: string | undefined) {
  if (!rule.updatedAt || !committedAt) {
    return true;
  }

  return Date.parse(rule.updatedAt) > Date.parse(committedAt);
}

export function reconstructReceipt({
  inference,
  rule,
  ruleUnread = false,
  currentLicenseSlug,
}: ReceiptInput): ReceiptReconstruction {
  if (inference.status !== 'COMMITTED' && inference.status !== 'RELEASED') {
    return unavailable('NOT_COMMITTED');
  }
  const status = requestStatusOf(inference);
  const snapshot = inference.pricing;
  if (snapshot) {
    const price = status
      ? priceUsage(snapshot, inference.usage, status)
      : ({ ok: false, error: 'INVALID_STATUS' } as const);

    return {
      kind: 'SNAPSHOT',
      snapshot,
      specificity: snapshot.specificity,
      price,
      agreesWithStored: matchesStored(price, inference),
    };
  }
  if (!inference.conversionRuleId) {
    return unavailable('NOT_AUTHORIZED');
  }
  if (ruleUnread) {
    return unavailable('RULE_NOT_READ');
  }
  if (rule === null || rule.id !== inference.conversionRuleId) {
    return unavailable('RULE_NOT_FOUND');
  }
  if (
    currentLicenseSlug != null &&
    rule.licenseSlug != null &&
    rule.licenseSlug !== currentLicenseSlug
  ) {
    return unavailable('RULE_NOT_ON_CURRENT_VERSION', rule);
  }
  if (editedAfter(rule, inference.committedAt)) {
    return unavailable('RULE_EDITED_AFTER_COMMIT', rule);
  }
  if (
    status === null ||
    inference.credits.computed == null ||
    inference.credits.charged == null
  ) {
    return unavailable('NOT_RECOMPUTABLE', rule);
  }
  const price = priceUsage(rule, inference.usage, status);
  if (!price.ok) {
    return unavailable('NOT_RECOMPUTABLE', rule);
  }
  if (!matchesStored(price, inference)) {
    return unavailable('AMOUNT_MISMATCH', rule);
  }

  return { kind: 'MATCHES', rule, specificity: specificityOf(rule), price };
}
