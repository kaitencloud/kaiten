import { describe, expect, it } from 'vite-plus/test';

import {
  findModelByRef,
  resolveLadder,
  resolveRule,
  specificityOf,
} from '../resolve-ladder';
import type { PricingModel, PricingRule, Specificity } from '../types';
import { CATALOGUE, MODELS, RULES, rule } from './sample-catalogue';

const MODEL = 'model-a';
const OTHER = 'model-b';
const active = (slug: string, status: PricingModel['status'] = 'ACTIVE') => ({ slug, status });

// Go: TestResolve (aicredit/pricing_test.go). Order as in Go: ANY_ALL, ANY_TYPED, EXACT_ALL, EXACT_TYPED.
describe('resolveRule, Go TestResolve', () => {
  const rules: PricingRule[] = [
    rule('v', null, null, { perRequest: '1' }),
    rule('v', null, 'COMPLETION', { perRequest: '1' }),
    rule('v', MODEL, null, { perRequest: '1' }),
    rule('v', MODEL, 'COMPLETION', { perRequest: '1' }),
  ];
  const cases: { name: string; rules: PricingRule[]; model: Pick<PricingModel, 'slug' | 'status'> | null; want: Specificity | null }[] = [
    { name: 'exact typed', rules, model: active(MODEL), want: 'EXACT_TYPED' },
    { name: 'exact all', rules: rules.slice(0, 3), model: active(MODEL), want: 'EXACT_ALL' },
    { name: 'any typed', rules: rules.slice(0, 2), model: active(MODEL), want: 'ANY_TYPED' },
    { name: 'any all', rules: rules.slice(0, 1), model: active(MODEL), want: 'ANY_ALL' },
    { name: 'future model wildcard', rules, model: active(OTHER), want: 'ANY_TYPED' },
    { name: 'deprecated still priced', rules, model: active(MODEL, 'DEPRECATED'), want: 'EXACT_TYPED' },
    { name: 'archived never priced', rules, model: active(MODEL, 'ARCHIVED'), want: null },
    { name: 'unknown never priced', rules, model: null, want: null },
    { name: 'inactive ignored', rules: [rule('v', MODEL, null, { perRequest: '1' }, { status: 'ARCHIVED' })], model: active(MODEL), want: null },
  ];

  it.each(cases)('$name', ({ rules: input, model, want }) => {
    expect(resolveRule(input, model, 'COMPLETION')?.specificity ?? null).toBe(want);
  });

  it('ignores a typed rule for another request type', () => {
    expect(resolveRule(rules, active(MODEL), 'EMBEDDING')?.specificity).toBe('EXACT_ALL');
  });
});

describe('resolveLadder', () => {
  const rules: PricingRule[] = [
    rule('v', null, null, { perRequest: '1' }),
    rule('v', null, 'COMPLETION', { perRequest: '2' }),
    rule('v', MODEL, null, { perRequest: '3' }),
    rule('v', MODEL, 'COMPLETION', { perRequest: '4' }),
  ];

  it('lists the four levels, the winner applying and the rest shadowed', () => {
    const ladder = resolveLadder(rules, active(MODEL), 'COMPLETION');

    expect(ladder.levels.map((level) => [level.specificity, level.state])).toEqual([
      ['EXACT_TYPED', 'APPLIES'],
      ['EXACT_ALL', 'SHADOWED'],
      ['ANY_TYPED', 'SHADOWED'],
      ['ANY_ALL', 'SHADOWED'],
    ]);
    expect(ladder).toMatchObject({ specificity: 'EXACT_TYPED', authorized: true, denialReason: null, warnings: [] });
    expect(ladder.winner?.rates.perRequest).toBe('4');
  });

  it('lets a typed wildcard and an all-types wildcard coexist: the typed one wins its type only', () => {
    const wildcards = rules.slice(0, 2);

    expect(resolveLadder(wildcards, active(OTHER), 'COMPLETION').specificity).toBe('ANY_TYPED');
    expect(resolveLadder(wildcards, active(OTHER), 'EMBEDDING').specificity).toBe('ANY_ALL');
    expect(resolveLadder(wildcards, active(OTHER), 'EMBEDDING').levels.map((level) => level.state)).toEqual(['EMPTY', 'EMPTY', 'EMPTY', 'APPLIES']);
  });

  it('marks matching rules blocked and denies MODEL_ARCHIVED for an archived model', () => {
    const ladder = resolveLadder(rules, active(MODEL, 'ARCHIVED'), 'COMPLETION');

    expect(ladder.levels.map((level) => level.state)).toEqual(['BLOCKED', 'BLOCKED', 'BLOCKED', 'BLOCKED']);
    expect(ladder).toMatchObject({ winner: null, specificity: null, authorized: false, denialReason: 'MODEL_ARCHIVED' });
  });

  it('denies UNKNOWN_MODEL without a model, wildcards blocked', () => {
    const ladder = resolveLadder(rules, null, 'COMPLETION');

    expect(ladder.levels.map((level) => level.state)).toEqual(['EMPTY', 'EMPTY', 'BLOCKED', 'BLOCKED']);
    expect(ladder.denialReason).toBe('UNKNOWN_MODEL');
  });

  it('denies NO_RULE when nothing matches', () => {
    expect(resolveLadder([], active(MODEL), 'COMPLETION')).toMatchObject({ authorized: false, denialReason: 'NO_RULE' });
  });

  it('prices a deprecated model and flags it', () => {
    expect(resolveLadder(rules, active(MODEL, 'DEPRECATED'), 'COMPLETION')).toMatchObject({ authorized: true, warnings: ['MODEL_DEPRECATED'] });
  });
});

// The ladder cases of the plan (§2.0), on the mockups' sample.
describe('resolveLadder on the mockups sample', () => {
  it.each([
    ['Opus on starter-v2', RULES['starter-v2'], MODELS.opus, 'COMPLETION', 'ANY_ALL'],
    ['Sonnet on business', RULES.business, MODELS.sonnet, 'COMPLETION', 'EXACT_TYPED'],
    ['Gemini Flash on enterprise-v2', RULES['enterprise-v2'], MODELS.geminiFlash, 'COMPLETION', 'EXACT_ALL'],
    ['Haiku on enterprise-v2', RULES['enterprise-v2'], MODELS.haiku, 'COMPLETION', 'ANY_TYPED'],
    ['Whisper (archived) on enterprise-v2', RULES['enterprise-v2'], MODELS.whisper, 'AUDIO', null],
    ['Voyage 3 on enterprise-v2, embedding', RULES['enterprise-v2'], MODELS.voyage, 'EMBEDDING', null],
  ] as const)('%s → %s', (_, rules, model, requestType, want) => {
    expect(resolveLadder(rules, model, requestType).specificity).toBe(want);
  });
});

describe('specificityOf', () => {
  it.each([
    [MODEL, 'COMPLETION', 'EXACT_TYPED'],
    [MODEL, null, 'EXACT_ALL'],
    [null, 'COMPLETION', 'ANY_TYPED'],
    [null, null, 'ANY_ALL'],
  ] as const)('model %s, type %s → %s', (modelSlug, requestType, want) => {
    expect(specificityOf({ modelSlug, requestType })).toBe(want);
  });
});

describe('findModelByRef', () => {
  it('finds a model by slug, then by external id, and returns null otherwise', () => {
    expect(findModelByRef(CATALOGUE, 'claude-sonnet-4-5')).toBe(MODELS.sonnet);
    expect(findModelByRef(CATALOGUE, 'claude-sonnet-4-5-20250929')).toBe(MODELS.sonnet);
    expect(findModelByRef(CATALOGUE, 'mistral-large-2411')).toBeNull();
  });

  it('prefers a slug over another model external id', () => {
    const models = [{ slug: 'a', status: 'ACTIVE' as const, externalIds: ['b'] }, { slug: 'b', status: 'ACTIVE' as const }];

    expect(findModelByRef(models, 'b')).toBe(models[1]);
  });
});
