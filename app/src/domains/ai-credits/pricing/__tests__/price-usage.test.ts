import { describe, expect, it } from 'vite-plus/test';

import type { AiUsage, ConversionRates } from '@/api-client';

import { isChargeable, type PriceOutcome, priceUsage } from '../price-usage';
import type {
  AiRequestStatus,
  ChargeOnError,
  PricingTerms,
} from '../types';
import { RULES } from './sample-catalogue';

function terms(
  rates: ConversionRates,
  min = '0',
  max: string | null = null,
  chargeOnError: ChargeOnError = 'NEVER',
): PricingTerms {
  return {
    rates,
    minimumCreditsPerRequest: min,
    maximumCreditsPerRequest: max,
    chargeOnError,
  };
}

function priced(outcome: PriceOutcome) {
  if (!outcome.ok) {
    throw new Error(`expected a price, got ${outcome.error}`);
  }

  return outcome;
}

// Go: TestPriceVector (aicredit/pricing_test.go), same inputs and strings.
describe('priceUsage, Go TestPriceVector', () => {
  const cases: {
    name: string;
    rates: ConversionRates;
    usage: AiUsage;
    min: string;
    max: string | null;
    computed: string;
    charged: string;
    missing: boolean;
  }[] = [
    { name: 'per request', rates: { perRequest: '1.2' }, usage: {}, min: '0', max: null, computed: '1.2', charged: '1.2', missing: false },
    {
      name: 'input cache fallback',
      rates: { perInputToken: '0.01' },
      usage: { inputTokens: 10, cacheReadInputTokens: 20, cacheWriteInputTokens: 30 },
      min: '0',
      max: null,
      computed: '0.6',
      charged: '0.6',
      missing: false,
    },
    {
      name: 'cache overrides',
      rates: { perInputToken: '1', perCachedInputToken: '0.1', perCacheWriteToken: '2' },
      usage: { inputTokens: 1, cacheReadInputTokens: 2, cacheWriteInputTokens: 3 },
      min: '0',
      max: null,
      computed: '7.2',
      charged: '7.2',
      missing: false,
    },
    { name: 'output', rates: { perOutputToken: '0.2' }, usage: { outputTokens: 5 }, min: '0', max: null, computed: '1', charged: '1', missing: false },
    { name: 'unit', rates: { perUnit: '2' }, usage: { units: '1.5' }, min: '0', max: null, computed: '3', charged: '3', missing: false },
    { name: 'seconds exact', rates: { perSecond: '0.7' }, usage: { durationMs: 1500 }, min: '0', max: null, computed: '1.05', charged: '1.05', missing: false },
    {
      name: 'composite',
      rates: { perRequest: '1', perInputToken: '0.01', perOutputToken: '0.1' },
      usage: { inputTokens: 10, outputTokens: 5 },
      min: '0',
      max: null,
      computed: '1.6',
      charged: '1.6',
      missing: false,
    },
    { name: 'minimum missing', rates: { perOutputToken: '1' }, usage: {}, min: '2', max: null, computed: '2', charged: '2', missing: true },
    { name: 'present zero', rates: { perOutputToken: '1' }, usage: { outputTokens: 0 }, min: '2', max: null, computed: '0', charged: '2', missing: false },
    { name: 'maximum', rates: { perRequest: '10' }, usage: {}, min: '2', max: '5', computed: '10', charged: '5', missing: false },
    { name: 'half up', rates: { perInputToken: '0.0000005' }, usage: { inputTokens: 1 }, min: '0', max: null, computed: '0.000001', charged: '0.000001', missing: false },
    { name: 'below quantum', rates: { perInputToken: '0.0000004' }, usage: { inputTokens: 1 }, min: '0', max: null, computed: '0', charged: '0', missing: false },
  ];

  it.each(cases)('$name', ({ rates, usage, min, max, computed, charged, missing }) => {
    const result = priced(priceUsage(terms(rates, min, max), usage, 'SUCCESS'));

    expect(result.computed).toBe(computed);
    expect(result.charged).toBe(charged);
    expect(result.missingInput).toBe(missing);
  });
});

// Go: TestPricePolicy, the full policy × status matrix.
describe('priceUsage, Go TestPricePolicy', () => {
  const policies: ChargeOnError[] = ['NEVER', 'ALWAYS', 'PROVIDER_ERROR_ONLY'];
  const statuses: AiRequestStatus[] = ['SUCCESS', 'PROVIDER_ERROR', 'CUSTOMER_ERROR', 'NOT_SENT'];
  const matrix = policies.flatMap((policy) =>
    statuses.map((status) => ({
      policy,
      status,
      want:
        status === 'SUCCESS' ||
        (status === 'PROVIDER_ERROR' && policy !== 'NEVER') ||
        (status === 'CUSTOMER_ERROR' && policy === 'ALWAYS')
          ? '2'
          : '0',
    })),
  );

  it.each(matrix)('$policy / $status charges $want', ({ policy, status, want }) => {
    const result = priced(priceUsage(terms({ perRequest: '1' }, '2', null, policy), {}, status));

    expect(result.charged).toBe(want);
    expect(result.computed).toBe('1');
    expect(result.chargeable).toBe(want === '2');
    expect(isChargeable(policy, status)).toBe(want === '2');
  });

  it('never charges NOT_SENT, even under ALWAYS', () => {
    expect(priced(priceUsage(terms({ perRequest: '5' }, '0', null, 'ALWAYS'), {}, 'NOT_SENT')).charged).toBe('0');
  });
});

// Go: TestPriceRejectsMalformedInput.
describe('priceUsage, Go TestPriceRejectsMalformedInput', () => {
  const cases: { name: string; terms: PricingTerms; usage: AiUsage; status: string; error: string }[] = [
    { name: 'no rates', terms: terms({}), usage: {}, status: 'SUCCESS', error: 'NO_RATE' },
    { name: 'negative rate', terms: terms({ perRequest: '-1' }), usage: {}, status: 'SUCCESS', error: 'INVALID_RATE' },
    { name: 'rate precision', terms: terms({ perRequest: '0.00000000001' }), usage: {}, status: 'SUCCESS', error: 'INVALID_RATE' },
    { name: 'inverted bounds', terms: terms({ perRequest: '1' }, '2', '1'), usage: {}, status: 'SUCCESS', error: 'INVALID_MAXIMUM' },
    { name: 'negative tokens', terms: terms({ perRequest: '1' }), usage: { inputTokens: -1 }, status: 'SUCCESS', error: 'INVALID_USAGE' },
    { name: 'negative units', terms: terms({ perRequest: '1' }), usage: { units: '-1' }, status: 'SUCCESS', error: 'INVALID_USAGE' },
    { name: 'unknown status', terms: terms({ perRequest: '1' }), usage: {}, status: 'unknown', error: 'INVALID_STATUS' },
    { name: 'unknown policy', terms: { ...terms({ perRequest: '1' }), chargeOnError: '' as ChargeOnError }, usage: {}, status: 'SUCCESS', error: 'INVALID_POLICY' },
  ];

  it.each(cases)('$name', ({ terms: input, usage, status, error }) => {
    expect(priceUsage(input, usage, status as AiRequestStatus)).toEqual({ ok: false, error });
  });

  it.each([
    ['a minimum with 7 decimals', terms({ perRequest: '1' }, '0.0000001'), 'INVALID_MINIMUM'],
    ['a negative minimum', terms({ perRequest: '1' }, '-1'), 'INVALID_MINIMUM'],
    ['a maximum with 7 decimals', terms({ perRequest: '1' }, '0', '1.0000001'), 'INVALID_MAXIMUM'],
    ['a rate that is not a decimal', terms({ perRequest: '1e-3' }), 'INVALID_RATE'],
    ['a blank rate', terms({ perRequest: '' }), 'INVALID_RATE'],
  ])('refuses %s', (_, input, error) => {
    expect(priceUsage(input, {}, 'SUCCESS')).toEqual({ ok: false, error });
  });

  it.each([
    ['a fractional token count', { inputTokens: 1.5 }],
    ['an unsafe token count', { outputTokens: 2 ** 60 }],
    ['units that are not a decimal', { units: 'two' }],
  ])('refuses %s', (_, usage) => {
    expect(priceUsage(terms({ perRequest: '1' }), usage as AiUsage, 'SUCCESS')).toEqual({ ok: false, error: 'INVALID_USAGE' });
  });

  it('accepts a 10-decimal rate written with trailing zeros', () => {
    expect(priced(priceUsage(terms({ perRequest: '0.12345678900' }), {})).computed).toBe('0.123457');
  });
});

describe('priceUsage, null versus zero rates', () => {
  it('treats an explicit 0 cache rate as free, not as the input rate', () => {
    const result = priced(priceUsage(terms({ perInputToken: '0.01', perCachedInputToken: '0' }), { cacheReadInputTokens: 100 }));

    expect(result.computed).toBe('0');
    expect(result.missingInput).toBe(false);
    expect(result.lines).toEqual([{ dimension: 'CACHE_READ_TOKEN', quantity: '100', rate: '0', rateSource: 'OWN', credits: '0' }]);
  });

  it('falls back to the input rate for a null cache rate, and says so', () => {
    const result = priced(priceUsage(terms({ perInputToken: '0.01' }), { cacheWriteInputTokens: 30 }));

    expect(result.lines).toEqual([{ dimension: 'CACHE_WRITE_TOKEN', quantity: '30', rate: '0.01', rateSource: 'INPUT_FALLBACK', credits: '0.3' }]);
  });

  it('prices nothing for a quantity whose rate is null: missing input, the minimum, a warning', () => {
    const result = priced(priceUsage(terms({ perOutputToken: '0.002' }, '0.5'), { inputTokens: 1500 }));

    expect(result).toMatchObject({ computed: '0.5', charged: '0.5', missingInput: true, clamp: null, lines: [], warnings: ['CONVERSION_INPUT_MISSING'] });
  });

  it('charges 0 on a missing input under a refused status, but still computes the minimum', () => {
    const result = priced(priceUsage(terms({ perOutputToken: '1' }, '2'), {}, 'CUSTOMER_ERROR'));

    expect(result).toMatchObject({ computed: '2', charged: '0', missingInput: true, chargeable: false });
  });

  it('prices a zero vector to zero when the minimum is zero', () => {
    expect(priced(priceUsage(terms({ perRequest: '0' }), {}))).toMatchObject({ computed: '0', charged: '0', missingInput: false });
  });
});

describe('priceUsage, clamp order and quantisation', () => {
  it('raises to the minimum and says so', () => {
    expect(priced(priceUsage(terms({ perInputToken: '0.0001' }, '0.5'), { inputTokens: 10 }))).toMatchObject({ computed: '0.001', charged: '0.5', clamp: 'MINIMUM' });
  });

  it('caps at the maximum and says so', () => {
    expect(priced(priceUsage(terms({ perOutputToken: '0.002' }, '0.5', '250'), { outputTokens: 200000 }))).toMatchObject({ computed: '400', charged: '250', clamp: 'MAXIMUM' });
  });

  it('applies the bounds before rounding, and keeps the unrounded sum', () => {
    const result = priced(priceUsage(terms({ perInputToken: '0.0000001234' }), { inputTokens: 5 }));

    expect(result.exactComputed).toBe('0.000000617');
    expect(result.computed).toBe('0.000001');
  });

  it.each([
    ['0.0000005', '0.000001'],
    ['0.0000004999', '0'],
    ['1.2345675', '1.234568'],
    ['1.2345674999', '1.234567'],
  ])('rounds %s half-up at the 7th decimal to %s', (rate, want) => {
    expect(priced(priceUsage(terms({ perInputToken: rate }), { inputTokens: 1 })).computed).toBe(want);
  });

  it('rounds a sum of 10-decimal products half-up at the 7th decimal', () => {
    // 3 × 0.0000001667 = 0.0000005001 → 0.000001; 3 × 0.0000001666 = 0.0000004998 → 0.
    expect(priced(priceUsage(terms({ perInputToken: '0.0000001667' }), { inputTokens: 3 })).computed).toBe('0.000001');
    expect(priced(priceUsage(terms({ perInputToken: '0.0000001666' }), { inputTokens: 3 })).computed).toBe('0');
  });
});

describe('priceUsage, the mockups headline numbers', () => {
  const sonnet = (version: keyof typeof RULES) => RULES[version][0];

  it.each([
    ['starter-v2', '1'],
    ['business', '2.4'],
    ['enterprise-v2', '1.6'],
  ] as const)('prices the Sonnet reference call (1,500 in / 500 out) on %s at %s credits', (version, want) => {
    expect(priced(priceUsage(sonnet(version), { inputTokens: 1500, outputTokens: 500 })).charged).toBe(want);
  });

  it('gives the receipt of 1,240 in / 3,100 cache read / 380 out as 0.496 + 0.124 + 0.76 = 1.38', () => {
    const result = priced(priceUsage(sonnet('enterprise-v2'), { inputTokens: 1240, cacheReadInputTokens: 3100, outputTokens: 380 }));

    expect(result.lines.map((line) => [line.dimension, line.quantity, line.rate, line.credits])).toEqual([
      ['INPUT_TOKEN', '1240', '0.0004', '0.496'],
      ['CACHE_READ_TOKEN', '3100', '0.00004', '0.124'],
      ['OUTPUT_TOKEN', '380', '0.002', '0.76'],
    ]);
    expect(result.computed).toBe('1.38');
    expect(result.charged).toBe('1.38');
  });

  it('prices 95 s of transcription per second, not per unit', () => {
    const transcribe = RULES['enterprise-v2'][5];

    expect(priced(priceUsage(transcribe, { units: '95', durationMs: 95000 })).charged).toBe('1.9');
  });
});
