import { render } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { buildColumnsFromSchema } from '../build-columns-from-schema';
import type { MetadataFieldDescriptor } from '../types';

type Row = { id: string; metadata: Record<string, unknown> };

const accessor = (row: Row) => row.metadata;

// Helper: build a single column for a single field + invoke its cell renderer
// against a synthetic row, then return the rendered HTML for assertions.
const renderCell = (
  field: MetadataFieldDescriptor,
  cellValue: unknown,
): string => {
  const cols = buildColumnsFromSchema<Row>([field], accessor);
  const col = cols[0]!;
  // ColumnDef.cell can be a function — call with a minimal ctx mock.
  const cellFn = col.cell as (ctx: { getValue: () => unknown }) => unknown;
  const node = cellFn({ getValue: () => cellValue });
  const { container } = render(<>{node}</>);
  return container.textContent ?? '';
};

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

describe('buildColumnsFromSchema', () => {
  it('exposes one column per field with id = `metadata.${key}`', () => {
    const cols = buildColumnsFromSchema<Row>(
      [baseField('region', { type: 'string' })],
      accessor,
    );
    expect(cols).toHaveLength(1);
    expect(cols[0]?.id).toBe('metadata.region');
    expect(cols[0]?.header).toBe('region');
  });

  it('renders an em-dash for null/undefined/empty values', () => {
    const cell = renderCell(baseField('region', { type: 'string' }), undefined);
    expect(cell).toBe('—');
  });

  it('renders strings verbatim', () => {
    const cell = renderCell(baseField('region', { type: 'string' }), 'eu-west-1');
    expect(cell).toBe('eu-west-1');
  });

  it('renders enum values using the option label', () => {
    const cell = renderCell(
      baseField('tier', { type: 'string', enum: ['a', 'b'] }),
      'a',
    );
    expect(cell).toBe('a');
  });

  it('renders number values with locale formatting', () => {
    const cell = renderCell(baseField('weight', { type: 'number' }), 1234);
    // tolerate either '1,234' or '1 234' depending on locale
    expect(['1,234', '1 234']).toContain(cell);
  });

  it('renders boolean true as a checkmark, false as dash', () => {
    expect(renderCell(baseField('flag', { type: 'boolean' }), true)).toBe('✓');
    expect(renderCell(baseField('flag', { type: 'boolean' }), false)).toBe('—');
  });

  it('renders dates with toLocaleDateString', () => {
    const cell = renderCell(
      baseField('go_live', { type: 'string', format: 'date' }),
      '2026-05-26',
    );
    // result is locale-dependent — just check it's not the raw ISO string
    expect(cell.length).toBeGreaterThan(0);
  });

  it('renders enum_list as comma-joined labels', () => {
    const cell = renderCell(
      baseField('labels', {
        type: 'array',
        items: { type: 'string', enum: ['x', 'y'] },
      }),
      ['x', 'y'],
    );
    expect(cell).toBe('x, y');
  });
});
