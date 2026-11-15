import type { AiInference } from '@/api-client';
import {
  aiPricingSnapshot,
  buildAiInferences,
  buildAiModels,
  buildAiRules,
} from '../../../../../../../e2e/app/_support/fixtures';
import { buildReceiptView, type ReceiptPool } from '../receipt/receipt-view';

/**
 * The mock world's Acme Production feed (`txn_acme_001`…`016`), priced by the
 * same catalogue and rules as `dev:mock` and the e2e specs, at a fixed clock.
 */
export const NOW = Date.parse('2026-11-11T09:40:00.000Z');
export const models = buildAiModels();
export const rules = buildAiRules([]);
const inferences = buildAiInferences({
  models,
  now: NOW,
  rules,
  windowStart: '2026-11-01T00:00:00.000Z',
});

export const POOL: ReceiptPool = {
  slug: 'ai-credits',
  name: 'AI credits',
  licenseSlug: 'enterprise-v2',
  limit: 250_000,
  maximum: 275_000,
};

export function acme(n: number): AiInference {
  const id = `txn_acme_${String(n).padStart(3, '0')}`;
  const row = inferences.find((item) => item.transactionId === id);
  if (!row) {
    throw new Error(`No ${id} in the mock world`);
  }
  const { entitlementSlug: _pool, instanceSlug: _instance, ...inference } = row;

  return inference;
}

/**
 * A row as it was recorded before the API stored the snapshot: no `pricing`,
 * no licence, no vendor cost, no journal sequence. The receipt then
 * reconstructs from the rule as it is now.
 */
export function legacy(inference: AiInference): AiInference {
  const {
    licenseId: _id,
    licenseSlug: _slug,
    pricing: _pricing,
    reportSeq: _seq,
    vendorCost: _cost,
    ...row
  } = inference;

  return { ...row, warnings: [] };
}

/** Row `n` of the feed as an older row, without a snapshot. */
export const older = (n: number) => legacy(acme(n));

export function ruleOf(inference: AiInference) {
  return rules.find((rule) => rule.id === inference.conversionRuleId) ?? null;
}

/** The snapshot the API stores for a row priced by `rule`. */
export const snapshotOf = aiPricingSnapshot;

/** The receipt of a row of the feed, as the sheet builds it. */
export function viewOf(
  inference: AiInference,
  options: {
    creditValue?: string | null;
    rule?: ReturnType<typeof ruleOf>;
    /** The session may not read the rule, or the catalogue. */
    ruleUnread?: boolean;
    catalogueUnread?: boolean;
  } = {},
) {
  return buildReceiptView({
    inference,
    rule: options.ruleUnread
      ? null
      : options.rule === undefined
        ? ruleOf(inference)
        : options.rule,
    ruleUnread: options.ruleUnread,
    models: options.catalogueUnread ? [] : models,
    catalogueUnread: options.catalogueUnread,
    pool: POOL,
    creditValue: options.creditValue ?? null,
  });
}
