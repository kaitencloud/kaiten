import { describe, expect, it } from 'vite-plus/test';

import { priceUsage } from '../price-usage';
import {
  costPerCredit,
  margin,
  percentToFactor,
  ratesFromVendorCost,
  scaleRates,
} from '../steering';
import { vendorCost } from '../vendor-cost';
import { CREDIT_VALUE, MODELS, RULES } from './sample-catalogue';

const REFERENCE = { inputTokens: 1500, outputTokens: 500 };

describe('vendorCost', () => {
  it.each([
    ['Sonnet, reference call', MODELS.sonnet, REFERENCE, '0.012'],
    ['Opus, reference call', MODELS.opus, REFERENCE, '0.06'],
    ['Haiku, reference call', MODELS.haiku, REFERENCE, '0.004'],
    ['Sonnet, receipt call', MODELS.sonnet, { inputTokens: 1240, cacheReadInputTokens: 3100, outputTokens: 380 }, '0.01035'],
    ['GPT Image 1, two images', MODELS.gptImage, { units: '2' }, '0.08'],
  ] as const)('%s costs $%s', (_, model, usage, want) => {
    expect(vendorCost(model.vendorCosts, usage)).toMatchObject({ known: true, complete: true, total: want });
  });

  it('falls back to the input cost for cache tokens without their own cost', () => {
    const result = vendorCost({ currency: 'USD', perInputToken: '0.000001' }, { cacheReadInputTokens: 1000, cacheWriteInputTokens: 10 });

    expect(result.total).toBe('0.00101');
    expect(result.lines.map((line) => line.costSource)).toEqual(['INPUT_FALLBACK', 'INPUT_FALLBACK']);
  });

  it('costs a request once when the catalogue has a per-request cost', () => {
    expect(vendorCost({ currency: 'USD', perRequest: '0.002' }, {}).total).toBe('0.002');
  });

  it('marks output without an output cost as uncosted', () => {
    expect(vendorCost(MODELS.embeddingSmall.vendorCosts, { inputTokens: 1000, outputTokens: 5 })).toMatchObject({
      known: true,
      complete: false,
      total: '0.00002',
      uncosted: ['OUTPUT_TOKEN'],
    });
  });

  it('never costs a duration: the catalogue has no per-second cost', () => {
    expect(vendorCost(MODELS.transcribe.vendorCosts, { units: '60', durationMs: 60000 }).total).toBe('0.006');
  });

  it('is unknown without costs or with invalid usage', () => {
    expect(vendorCost(undefined, REFERENCE)).toMatchObject({ known: false, total: null });
    expect(vendorCost(MODELS.sonnet.vendorCosts, { inputTokens: -1 })).toMatchObject({ known: false, total: null });
  });
});

describe('costPerCredit and margin, the mockups headline numbers', () => {
  const cases = [
    ['Sonnet on enterprise-v2', RULES['enterprise-v2'][0], MODELS.sonnet, '0.0075', '0.25'],
    ['Sonnet on business', RULES.business[0], MODELS.sonnet, '0.005', '0.5'],
    ['Sonnet on starter-v2 (the −20 % Starter margin)', RULES['starter-v2'][0], MODELS.sonnet, '0.012', '-0.2'],
    ['Opus on starter-v2', RULES['starter-v2'][0], MODELS.opus, '0.06', '-5'],
    ['Haiku on starter-v2', RULES['starter-v2'][0], MODELS.haiku, '0.004', '0.6'],
  ] as const;

  it.each(cases)('%s: cost per credit %s, margin %s', (_, rule, model, cpc, want) => {
    const price = priceUsage(rule, REFERENCE);
    const cost = vendorCost(model.vendorCosts, REFERENCE);
    const charged = price.ok ? price.charged : null;

    expect(costPerCredit(cost.total, charged)).toBe(cpc);
    expect(margin({ vendorUsd: cost.total, chargedCredits: charged, creditValue: CREDIT_VALUE })).toBe(want);
  });

  it('has no cost per credit when nothing is charged, and no margin without a credit value', () => {
    expect(costPerCredit('0.012', '0')).toBeNull();
    expect(costPerCredit(null, '1')).toBeNull();
    expect(margin({ vendorUsd: '0.012', chargedCredits: '1.6', creditValue: null })).toBeNull();
    expect(margin({ vendorUsd: '0.012', chargedCredits: '1.6', creditValue: '0' })).toBeNull();
    expect(margin({ vendorUsd: null, chargedCredits: '1.6', creditValue: '0.01' })).toBeNull();
  });
});

describe('scaleRates', () => {
  it('scales Sonnet on enterprise-v2 by −15 %: 0.0004 → 0.00034, reference 1.60 → 1.36, margin 25 % → 12 %', () => {
    const sonnet = RULES['enterprise-v2'][0];
    const factor = percentToFactor('-15');
    const rates = factor === null ? null : scaleRates(sonnet.rates, factor);

    expect(factor).toBe('0.85');
    expect(rates).toEqual({
      perRequest: null,
      perInputToken: '0.00034',
      perCachedInputToken: '0.000034',
      perCacheWriteToken: '0.000425',
      perOutputToken: '0.0017',
      perUnit: null,
      perSecond: null,
    });
    const price = rates ? priceUsage({ ...sonnet, rates }, REFERENCE) : null;

    expect(price?.ok && price.charged).toBe('1.36');
    expect(margin({ vendorUsd: '0.012', chargedCredits: '1.36', creditValue: CREDIT_VALUE })).toBe('0.117647');
  });

  it('rounds scaled rates half-up to 10 decimals', () => {
    expect(scaleRates({ perInputToken: '0.0000000003' }, '0.5')?.perInputToken).toBe('0.0000000002');
  });

  it.each([
    ['10', '1.1'],
    ['0', '1'],
    ['-100', '0'],
    ['12.5', '1.125'],
  ])('reads %s %% as the factor %s', (percent, factor) => {
    expect(percentToFactor(percent)).toBe(factor);
  });

  it('refuses a negative factor', () => {
    expect(percentToFactor('-101')).toBeNull();
    expect(scaleRates({ perRequest: '1' }, '-1')).toBeNull();
  });
});

describe('ratesFromVendorCost', () => {
  it('derives the enterprise-v2 Sonnet rates from its vendor cost at $0.0075 per credit', () => {
    expect(ratesFromVendorCost(MODELS.sonnet.vendorCosts ?? { currency: 'USD' }, '0.0075')).toEqual({
      perRequest: null,
      perInputToken: '0.0004',
      perCachedInputToken: '0.00004',
      perCacheWriteToken: '0.0005',
      perOutputToken: '0.002',
      perUnit: null,
      perSecond: null,
    });
  });

  it('refuses a target that is not positive', () => {
    expect(ratesFromVendorCost({ currency: 'USD', perUnit: '0.04' }, '0')).toBeNull();
  });
});
