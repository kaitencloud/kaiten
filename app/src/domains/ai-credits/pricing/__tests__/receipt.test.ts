import { describe, expect, it } from 'vite-plus/test';

import { reconstructReceipt } from '../receipt';
import type { AiInferenceWithSnapshot, PricingRule, PricingSnapshot } from '../types';
import { RULES } from './sample-catalogue';

const SONNET_RULE = RULES['enterprise-v2'][0];

function row(overrides: Partial<AiInferenceWithSnapshot> = {}): AiInferenceWithSnapshot {
  return {
    transactionId: 'inf_01JCQ2K7Z9',
    reportedAt: '2026-11-11T09:26:41Z',
    committedAt: '2026-11-11T09:26:43Z',
    model: 'claude-sonnet-4-5-20250929',
    modelSlug: 'claude-sonnet-4-5',
    requestType: 'COMPLETION',
    requestStatus: 'SUCCESS',
    status: 'COMMITTED',
    authorized: true,
    conversionRuleId: SONNET_RULE.id,
    usage: { inputTokens: 1240, cacheReadInputTokens: 3100, outputTokens: 380 },
    credits: { reserved: '2.15', computed: '1.380000', charged: '1.38' },
    refunds: [],
    warnings: [],
    ...overrides,
  };
}

describe('reconstructReceipt without a snapshot', () => {
  it('matches the 1.38-credit receipt and returns the formula lines', () => {
    const result = reconstructReceipt({ inference: row(), rule: SONNET_RULE, currentLicenseSlug: 'enterprise-v2' });

    expect(result.kind).toBe('MATCHES');
    if (result.kind === 'MATCHES') {
      expect(result.specificity).toBe('EXACT_TYPED');
      expect(result.price.lines.map((line) => line.credits)).toEqual(['0.496', '0.124', '0.76']);
      expect(result.price.computed).toBe('1.38');
    }
  });

  it('refuses when recomputation differs from the stored amount', () => {
    const result = reconstructReceipt({ inference: row({ credits: { computed: '1.5', charged: '1.5' } }), rule: SONNET_RULE });

    expect(result).toMatchObject({ kind: 'CANNOT_RECONSTRUCT', reason: 'AMOUNT_MISMATCH', specificity: 'EXACT_TYPED' });
  });

  it('refuses when only the charged amount differs (the policy changed)', () => {
    const inference = row({ requestStatus: 'PROVIDER_ERROR', credits: { computed: '1.38', charged: '0' } });
    const rule: PricingRule = { ...SONNET_RULE, chargeOnError: 'ALWAYS' };

    expect(reconstructReceipt({ inference, rule })).toMatchObject({ reason: 'AMOUNT_MISMATCH' });
  });

  it('refuses a rule edited after the commit, even if its numbers would match', () => {
    const rule: PricingRule = { ...SONNET_RULE, updatedAt: '2026-11-11T09:30:00Z' };

    expect(reconstructReceipt({ inference: row(), rule })).toMatchObject({ reason: 'RULE_EDITED_AFTER_COMMIT' });
  });

  it('refuses a rule without an update time', () => {
    const rule: PricingRule = { ...SONNET_RULE, updatedAt: undefined };

    expect(reconstructReceipt({ inference: row(), rule })).toMatchObject({ reason: 'RULE_EDITED_AFTER_COMMIT' });
  });

  it.each([
    ['no rule', null],
    ['another rule', RULES['enterprise-v2'][1]],
  ])('reports RULE_NOT_FOUND with %s', (_, rule) => {
    expect(reconstructReceipt({ inference: row(), rule })).toMatchObject({ reason: 'RULE_NOT_FOUND' });
  });

  it('reports a rule from another licence version than the current one', () => {
    expect(reconstructReceipt({ inference: row(), rule: SONNET_RULE, currentLicenseSlug: 'enterprise-v3' })).toMatchObject({
      reason: 'RULE_NOT_ON_CURRENT_VERSION',
    });
  });

  it.each(['RESERVED', 'EXPIRED'] as const)('has nothing to reconstruct while %s', (status) => {
    expect(reconstructReceipt({ inference: row({ status }), rule: SONNET_RULE })).toMatchObject({ reason: 'NOT_COMMITTED' });
  });

  it('reports NOT_AUTHORIZED for a denied call', () => {
    const inference = row({ conversionRuleId: undefined, authorized: false, denialReason: 'NO_RULE', credits: { computed: '0', charged: '0' } });

    expect(reconstructReceipt({ inference, rule: null })).toMatchObject({ reason: 'NOT_AUTHORIZED' });
  });

  it('reconstructs a released NOT_SENT call: computed stored, nothing charged', () => {
    const inference = row({ status: 'RELEASED', requestStatus: 'NOT_SENT', credits: { computed: '1.38', charged: '0' } });

    expect(reconstructReceipt({ inference, rule: SONNET_RULE })).toMatchObject({ kind: 'MATCHES', price: { charged: '0', chargeable: false } });
  });

  it('reports NOT_RECOMPUTABLE without a request status', () => {
    expect(reconstructReceipt({ inference: row({ requestStatus: undefined }), rule: SONNET_RULE })).toMatchObject({ reason: 'NOT_RECOMPUTABLE' });
  });
});

describe('reconstructReceipt with a snapshot', () => {
  const snapshot: PricingSnapshot = {
    ruleId: SONNET_RULE.id,
    specificity: 'EXACT_TYPED',
    rates: { perInputToken: '0.0004', perCachedInputToken: '0.00004', perOutputToken: '0.002' },
    minimumCreditsPerRequest: '0.5',
    maximumCreditsPerRequest: '250',
    chargeOnError: 'NEVER',
  };

  it('uses the snapshot as authoritative, whatever the rule says today', () => {
    const editedToday: PricingRule = { ...SONNET_RULE, rates: { perRequest: '9' }, updatedAt: '2026-11-11T10:00:00Z' };
    const result = reconstructReceipt({ inference: row({ pricing: snapshot }), rule: editedToday });

    expect(result).toMatchObject({ kind: 'SNAPSHOT', specificity: 'EXACT_TYPED', agreesWithStored: true, price: { ok: true, computed: '1.38' } });
  });

  it('says when the snapshot does not give back the stored amounts', () => {
    const result = reconstructReceipt({ inference: row({ pricing: { ...snapshot, rates: { perRequest: '2' } } }), rule: null });

    expect(result).toMatchObject({ kind: 'SNAPSHOT', agreesWithStored: false });
  });
});
