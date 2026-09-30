import { describe, expect, it } from 'vite-plus/test';
import { buildFiltersFromSchema } from '../build-filters-from-schema';
import type { MetadataFieldDescriptor } from '../types';

type Row = { metadata: Record<string, unknown> };

const accessor = (row: Row) => row.metadata;

const baseField = (
  key: string,
  schema: Record<string, unknown>,
): MetadataFieldDescriptor => ({
  id: key,
  key,
  label: key,
  displayOrder: 0,
  jsonSchema: schema,
});

describe('buildFiltersFromSchema', () => {
  it.each([
    [{ type: 'string' }, 'text', undefined],
    [{ type: 'string', enum: ['a', 'b'] }, 'enum', 2],
    [{ type: 'string', format: 'date' }, 'date', undefined],
    [{ type: 'number' }, 'number', undefined],
    [{ type: 'boolean' }, 'boolean', undefined],
    [
      { type: 'array', items: { type: 'string', enum: ['x', 'y'] } },
      'enum_list',
      2,
    ],
  ])('maps %j → filter type %s', (schema, expectedType, expectedOptionCount) => {
    const [filter] = buildFiltersFromSchema<Row>(
      [baseField('k', schema)],
      accessor,
    );
    expect(filter?.type).toBe(expectedType);
    if (expectedOptionCount === undefined) {
      expect(filter?.options).toBeUndefined();
    } else {
      expect(filter?.options).toHaveLength(expectedOptionCount);
    }
  });

  it('exposes an accessor that reads from metadata via metadataAccessor', () => {
    const [filter] = buildFiltersFromSchema<Row>(
      [baseField('region', { type: 'string' })],
      accessor,
    );
    expect(filter?.accessor({ metadata: { region: 'eu' } })).toBe('eu');
  });

  it('returns undefined accessor result when metadata is null', () => {
    const [filter] = buildFiltersFromSchema<Row>(
      [baseField('region', { type: 'string' })],
      (row) => (row.metadata as Record<string, unknown> | null) ?? null,
    );
    expect(filter?.accessor({ metadata: null as unknown as Record<string, unknown> })).toBeUndefined();
  });

  it('marks every metadata filter as both normal- and advanced-filterable', () => {
    const [filter] = buildFiltersFromSchema<Row>(
      [baseField('region', { type: 'string' })],
      accessor,
    );
    expect(filter?.normalFilterable).toBe(true);
    expect(filter?.advancedFilterable).toBe(true);
  });
});
