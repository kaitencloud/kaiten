import { describe, expect, it } from 'vite-plus/test';
import type { Model } from '@/api-client';
import type { RateCardLicense } from '@/domains/ai-credits';
import { filterModels, ruleCountsByModel, vendorCostSummary } from '../model-list-model';

describe('vendorCostSummary', () => {
  it('shows token costs per million tokens, by an exact shift of the decimal', () => {
    expect(
      vendorCostSummary({ currency: 'USD', perInputToken: '0.000003', perOutputToken: '0.000015' }),
    ).toEqual({ input: '3', output: '15', unit: null });
    expect(vendorCostSummary({ currency: 'USD', perInputToken: '0.00000002' })).toEqual({
      input: '0.02',
      output: null,
      unit: null,
    });
    expect(vendorCostSummary({ currency: 'USD', perInputToken: '0.000000125' })?.input).toBe('0.125');
  });

  it('shows a unit cost as it is', () => {
    expect(vendorCostSummary({ currency: 'USD', perUnit: '0.04' })).toEqual({ input: null, output: null, unit: '0.04' });
  });

  it('is null for a model with no cost', () => {
    expect(vendorCostSummary(undefined)).toBeNull();
    expect(vendorCostSummary({ currency: 'USD' })).toBeNull();
  });
});

describe('ruleCountsByModel', () => {
  const rule = (modelSlug: string | null, status = 'ACTIVE') => ({ modelSlug, status });
  const licenses = [
    { conversionRules: [rule('gpt-5'), rule(null), rule('sonnet')] },
    { conversionRules: [rule('gpt-5'), rule('opus', 'ARCHIVED')] },
  ] as unknown as RateCardLicense[];

  it('counts the active rules that name a model, over every version, and no wildcard', () => {
    const counts = ruleCountsByModel(licenses);

    expect(counts.get('gpt-5')).toBe(2);
    expect(counts.get('sonnet')).toBe(1);
    expect(counts.has('opus')).toBe(false);
    expect(counts.size).toBe(2);
  });
});

describe('filterModels', () => {
  const models = [
    { name: 'GPT-5', slug: 'gpt-5', vendor: 'OpenAI', status: 'ACTIVE' },
    { name: 'Whisper', slug: 'whisper-large-v3', vendor: 'OpenAI', status: 'ARCHIVED' },
    { name: 'Voyage 3', slug: 'voyage-3', vendor: 'Voyage AI', status: 'ACTIVE' },
  ] as Model[];
  const labels = (model: Model) => [model.status === 'ARCHIVED' ? 'Archivé' : 'Actif'];
  const slugs = (search: string, status: 'all' | Model['status']) =>
    filterModels(models, { labels, search, status }).map((model) => model.slug);

  it('keeps one status, or all of them', () => {
    expect(slugs('', 'all')).toHaveLength(3);
    expect(slugs('', 'ARCHIVED')).toEqual(['whisper-large-v3']);
    expect(slugs('', 'DEPRECATED')).toEqual([]);
  });

  it('searches the name, the slug, the vendor and the labels shown, together with the status', () => {
    expect(slugs('openai', 'all')).toEqual(['gpt-5', 'whisper-large-v3']);
    expect(slugs('openai', 'ACTIVE')).toEqual(['gpt-5']);
    expect(slugs('archivé', 'all')).toEqual(['whisper-large-v3']);
    expect(slugs(' VOYAGE ', 'all')).toEqual(['voyage-3']);
  });
});
