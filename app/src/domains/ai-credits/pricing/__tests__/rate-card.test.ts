import { describe, expect, it } from 'vite-plus/test';

import { buildRateCardCell, steerOnCost, wildcardCoverage } from '../rate-card';
import { vendorCost } from '../vendor-cost';
import {
  AI_REQUEST_TYPES,
  DEFAULT_REFERENCE_CALLS,
  modelShowsRequestType,
  previewCalls,
  requestTypesForModality,
  validateReferenceCall,
} from '../reference-calls';
import type { AiRequestType, PricingModel, PricingRule } from '../types';
import { CATALOGUE, CREDIT_VALUE, MODELS, RULES, rule } from './sample-catalogue';

function cell(
  rules: readonly PricingRule[],
  model: PricingModel | null,
  requestType: AiRequestType = 'COMPLETION',
  options: { poolGranted?: boolean; creditValue?: string | null } = {},
) {
  return buildRateCardCell({
    rules,
    model,
    requestType,
    referenceUsage: DEFAULT_REFERENCE_CALLS[requestType],
    poolGranted: options.poolGranted ?? true,
    creditValue: options.creditValue === undefined ? CREDIT_VALUE : options.creditValue,
  });
}

describe('buildRateCardCell', () => {
  it('prices an own rule with its cost per credit and margin (Sonnet, enterprise-v2)', () => {
    const result = cell(RULES['enterprise-v2'], MODELS.sonnet);

    expect(result).toMatchObject({
      state: 'OWN_RULE',
      specificity: 'EXACT_TYPED',
      denialReason: null,
      deprecated: false,
      costPerCredit: '0.0075',
      margin: '0.25',
    });
    expect(result.price).toMatchObject({ ok: true, charged: '1.6' });
    expect(result.vendorCost?.total).toBe('0.012');
  });

  it('derives no cost per credit and no margin from a partial vendor cost, and says it is partial', () => {
    // An input cost and no output cost: 500 output tokens of the reference call are not costed.
    const inputOnly = { ...MODELS.sonnet, vendorCosts: { currency: 'USD' as const, perInputToken: '0.000003' } };
    const result = cell(RULES['enterprise-v2'], inputOnly);

    expect(result.price).toMatchObject({ ok: true, charged: '1.6' });
    expect(result.vendorCost).toMatchObject({ known: true, complete: false, total: '0.0045', uncosted: ['OUTPUT_TOKEN'] });
    expect(result).toMatchObject({ costPartial: true, costPerCredit: null, margin: null });
  });

  it('a whole cost is not partial, and no cost at all is unknown rather than partial', () => {
    expect(cell(RULES['enterprise-v2'], MODELS.sonnet).costPartial).toBe(false);
    const uncosted = { ...MODELS.sonnet, vendorCosts: undefined };

    expect(cell(RULES['enterprise-v2'], uncosted)).toMatchObject({ costPartial: false, costPerCredit: null, margin: null });
  });

  it('marks an EXACT_ALL rule as own (Gemini Flash, enterprise-v2)', () => {
    expect(cell(RULES['enterprise-v2'], MODELS.geminiFlash)).toMatchObject({ state: 'OWN_RULE', specificity: 'EXACT_ALL' });
  });

  it.each([
    ['Opus on starter-v2', RULES['starter-v2'], MODELS.opus, 'ANY_ALL', '-5'],
    ['Haiku on starter-v2', RULES['starter-v2'], MODELS.haiku, 'ANY_ALL', '0.6'],
    ['Haiku on enterprise-v2', RULES['enterprise-v2'], MODELS.haiku, 'ANY_TYPED', null],
  ] as const)('marks %s as inherited via %s, margin %s', (_, rules, model, level, want) => {
    const result = cell(rules, model);

    expect(result.state).toBe('INHERITED');
    expect(result.specificity).toBe(level);
    if (want !== null) {
      expect(result.margin).toBe(want);
    }
  });

  it('leaves the margin out without a credit value, and keeps the cost per credit', () => {
    expect(cell(RULES['enterprise-v2'], MODELS.sonnet, 'COMPLETION', { creditValue: null })).toMatchObject({ costPerCredit: '0.0075', margin: null });
  });

  it('refuses an archived model with MODEL_ARCHIVED, even where a wildcard would price it', () => {
    const result = cell([rule('v', null, null, { perRequest: '1' })], MODELS.whisper, 'AUDIO');

    expect(result).toMatchObject({ state: 'NOT_AUTHORIZED', denialReason: 'MODEL_ARCHIVED', price: null, costPerCredit: null });
    expect(result.ladder[3].state).toBe('BLOCKED');
  });

  it('refuses an unknown model with UNKNOWN_MODEL', () => {
    expect(cell(RULES['starter-v2'], null)).toMatchObject({ state: 'NOT_AUTHORIZED', denialReason: 'UNKNOWN_MODEL', vendorCost: null });
  });

  it('flags a granted pool without a rule: calls are refused with NO_RULE', () => {
    expect(cell(RULES['enterprise-v2'], MODELS.voyage, 'EMBEDDING')).toMatchObject({ state: 'NO_RULE', denialReason: 'NO_RULE', price: null });
  });

  it('shows a version that does not grant the pool, with the rule priced if one exists', () => {
    const result = cell(RULES['enterprise-v2'], MODELS.sonnet, 'COMPLETION', { poolGranted: false });

    expect(result).toMatchObject({ state: 'POOL_NOT_GRANTED', denialReason: null, specificity: 'EXACT_TYPED' });
    expect(result.price).toMatchObject({ ok: true, charged: '1.6' });
  });

  it('prices a deprecated model and flags it (GPT Image 1, enterprise-v2)', () => {
    const result = cell(RULES['enterprise-v2'], MODELS.gptImage, 'IMAGE_GENERATION');

    expect(result).toMatchObject({ state: 'OWN_RULE', deprecated: true });
    expect(result.price).toMatchObject({ ok: true, charged: '5' });
  });

  it('prices the audio reference call per second (60 s at 0.02)', () => {
    expect(cell(RULES['enterprise-v2'], MODELS.transcribe, 'AUDIO').price).toMatchObject({ ok: true, charged: '1.2' });
  });
});

describe('wildcardCoverage', () => {
  it('lists the non-archived models a wildcard wins for one request type', () => {
    const wildcard = RULES['enterprise-v2'][6];
    const covered = wildcardCoverage(wildcard, RULES['enterprise-v2'], CATALOGUE, 'COMPLETION').map((model) => model.slug);

    expect(covered).not.toContain(MODELS.sonnet.slug);
    expect(covered).not.toContain(MODELS.gpt5Mini.slug);
    expect(covered).not.toContain(MODELS.geminiFlash.slug);
    expect(covered).not.toContain(MODELS.whisper.slug);
    expect(covered).toContain(MODELS.haiku.slug);
    expect(covered).toContain(MODELS.voyage.slug);
  });
});

describe('reference calls', () => {
  it('defaults to the mockups reference calls, without zero quantities', () => {
    expect(DEFAULT_REFERENCE_CALLS.COMPLETION).toEqual({ inputTokens: 1500, outputTokens: 500 });
    expect(DEFAULT_REFERENCE_CALLS.EMBEDDING).toEqual({ inputTokens: 2000 });
    expect(previewCalls('COMPLETION').map((call) => call.kind)).toEqual(['SMALL', 'REFERENCE', 'LARGE']);
  });

  it.each(AI_REQUEST_TYPES)('has a valid default for %s', (requestType) => {
    expect(validateReferenceCall(DEFAULT_REFERENCE_CALLS[requestType])).toEqual([]);
  });

  it('reports each field the server would refuse', () => {
    expect(validateReferenceCall({ inputTokens: -1, outputTokens: 1.5, durationMs: Number.NaN, units: '1e3' })).toEqual([
      { field: 'inputTokens', code: 'NOT_A_COUNT' },
      { field: 'outputTokens', code: 'NOT_A_COUNT' },
      { field: 'durationMs', code: 'NOT_A_COUNT' },
      { field: 'units', code: 'NOT_A_QUANTITY' },
    ]);
  });

  it('accepts an empty call and explicit zeros', () => {
    expect(validateReferenceCall({})).toEqual([]);
    expect(validateReferenceCall({ inputTokens: 0, units: '0' })).toEqual([]);
  });
});

describe('requestTypesForModality', () => {
  it.each([
    ['TEXT', ['COMPLETION']],
    ['MULTIMODAL', ['COMPLETION']],
    ['EMBEDDING', ['EMBEDDING']],
    ['IMAGE', ['IMAGE_GENERATION']],
    ['AUDIO', ['AUDIO']],
    ['VIDEO', ['VIDEO']],
  ] as const)('%s shows %j', (modality, want) => {
    expect(requestTypesForModality(modality)).toEqual(want);
  });

  it('counts 8 / 2 / 1 / 1 / 0 active models per tab on the sample', () => {
    const counts = AI_REQUEST_TYPES.map(
      (requestType) => CATALOGUE.filter((model) => model.status !== 'ARCHIVED' && modelShowsRequestType(model, requestType)).length,
    );

    expect(counts).toEqual([8, 2, 1, 1, 0]);
  });
});

describe('steerOnCost', () => {
  const usage = DEFAULT_REFERENCE_CALLS.COMPLETION;

  it('gives both figures from a whole cost', () => {
    const whole = vendorCost({ currency: 'USD', perInputToken: '0.000003', perOutputToken: '0.000015' }, usage);

    expect(steerOnCost(whole, '1.6', '0.01')).toEqual({ costPerCredit: '0.0075', margin: '0.25', partial: false });
  });

  it('gives neither from a partial cost, whatever the credit value', () => {
    const partial = vendorCost({ currency: 'USD', perInputToken: '0.000003' }, usage);

    expect(steerOnCost(partial, '1.6', '0.01')).toEqual({ costPerCredit: null, margin: null, partial: true });
  });

  it('an unknown cost is not partial', () => {
    expect(steerOnCost(vendorCost(undefined, usage), '1.6', '0.01')).toEqual({ costPerCredit: null, margin: null, partial: false });
    expect(steerOnCost(null, '1.6')).toEqual({ costPerCredit: null, margin: null, partial: false });
  });
});
