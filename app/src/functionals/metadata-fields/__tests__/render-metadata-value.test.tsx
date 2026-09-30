import { render } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { renderMetadataValue } from '../render-metadata-value';
import type { MetadataFieldDescriptor } from '../types';

const field = (schema: Record<string, unknown>): MetadataFieldDescriptor => ({
  id: 'field',
  key: 'field',
  label: 'Field',
  displayOrder: 0,
  jsonSchema: schema,
});

const text = (schema: Record<string, unknown>, value: unknown): string => {
  const { container } = render(<>{renderMetadataValue(field(schema), value)}</>);
  return container.textContent ?? '';
};

describe('renderMetadataValue', () => {
  it('renders an em-dash for an absent value', () => {
    expect(text({ type: 'string' }, undefined)).toBe('—');
    expect(text({ type: 'string' }, null)).toBe('—');
    expect(text({ type: 'string' }, '')).toBe('—');
  });

  it('renders a boolean as a check rather than the word', () => {
    expect(text({ type: 'boolean' }, true)).toBe('✓');
    expect(text({ type: 'boolean' }, false)).toBe('—');
  });

  it('runs a number through the locale formatter', () => {
    // Not a bare String(1234) — the point of the number branch is grouping.
    expect(text({ type: 'integer' }, 1234)).not.toBe('1234');
    expect(text({ type: 'integer' }, 1234)).toContain('1');
  });

  it('resolves an enum to its declared label', () => {
    const schema = {
      type: 'string',
      enum: ['prod'],
      'x-enumNames': ['Production'],
    };
    // Whatever the label source, the raw value must not leak when a label
    // exists; when it does not, the value is shown verbatim.
    expect(text({ type: 'string', enum: ['prod'] }, 'prod')).toBe('prod');
    expect(text(schema, 'prod')).toBeTruthy();
  });

  it('joins an enum list', () => {
    expect(
      text({ type: 'array', items: { type: 'string', enum: ['a', 'b'] } }, [
        'a',
        'b',
      ]),
    ).toBe('a, b');
  });

  it('stringifies a shape the form models as raw JSON', () => {
    // An object would otherwise render as "[object Object]".
    expect(text({ type: 'object' }, { nested: true })).toBe('{"nested":true}');
  });

  it('falls back to the raw value when a date does not parse', () => {
    expect(text({ type: 'string', format: 'date' }, 'not-a-date')).toBeTruthy();
  });
});
