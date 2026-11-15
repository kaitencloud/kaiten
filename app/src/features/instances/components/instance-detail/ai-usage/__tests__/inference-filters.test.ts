import { describe, expect, it } from 'vite-plus/test';
import type { AiInference } from '@/api-client';
import { readAiUsageSearch } from '../ai-usage-search';
import {
  activeFilterCount,
  filtersFromSearch,
  modelFilterOptions,
  serverQuery,
} from '../inference-filters';

const row = (overrides: Partial<AiInference>): AiInference => ({
  credits: {},
  model: 'gpt-5',
  reportedAt: '2026-11-11T09:00:00.000Z',
  requestType: 'COMPLETION',
  status: 'COMMITTED',
  transactionId: 'txn',
  usage: {},
  authorized: true,
  refunds: [],
  warnings: [],
  ...overrides,
});

describe('inference filters', () => {
  it('reads the URL field by field and drops what is not valid', () => {
    expect(readAiUsageSearch({ status: 'BOGUS', type: 'EMBEDDING', auth: 'no', tx: ' ' })).toEqual({
      status: undefined,
      type: 'EMBEDDING',
      auth: 'no',
      tx: undefined,
      from: undefined,
      to: undefined,
      model: undefined,
      pool: undefined,
      receipt: undefined,
    });
  });

  it('sends every filter to the API, the dates as UTC instants', () => {
    const filters = filtersFromSearch({
      status: 'COMMITTED',
      tx: 'txn_1',
      from: '2026-11-01T00:00',
      to: 'nonsense',
      model: 'gpt-5',
      type: 'EMBEDDING',
      auth: 'no',
    });

    expect(serverQuery(filters)).toEqual({
      authorized: 'false',
      from: '2026-11-01T00:00:00.000Z',
      model: 'gpt-5',
      requestType: 'EMBEDDING',
      status: 'COMMITTED',
      to: undefined,
      transactionId: 'txn_1',
    });
    expect(serverQuery(filtersFromSearch({ auth: 'yes' })).authorized).toBe('true');
    expect(serverQuery(filtersFromSearch({})).authorized).toBeUndefined();
  });

  it('counts the filters that are set', () => {
    expect(activeFilterCount(filtersFromSearch({}))).toBe(0);
    expect(activeFilterCount(filtersFromSearch({ auth: 'yes', model: 'gpt-5' }))).toBe(2);
  });

  it('offers the names a model can be sent under, the loaded ones and the one in the URL', () => {
    const models = [
      { slug: 'gpt-5', externalIds: ['gpt-5-2025-08-07'] },
      { slug: 'voyage-3', externalIds: [] },
    ];

    expect(modelFilterOptions(models, [row({ model: 'mistral-large-2411' }), row({ model: 'gpt-5' })], 'typed-by-hand')).toEqual([
      'gpt-5',
      'gpt-5-2025-08-07',
      'mistral-large-2411',
      'typed-by-hand',
      'voyage-3',
    ]);
    // Applying the filter narrows the rows, never the list.
    expect(modelFilterOptions(models, [], 'gpt-5')).toHaveLength(3);
  });
});
