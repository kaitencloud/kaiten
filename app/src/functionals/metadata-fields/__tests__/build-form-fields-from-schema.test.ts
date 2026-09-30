import { describe, expect, it } from 'vite-plus/test';
import { buildFormFieldsFromSchema } from '../build-form-fields-from-schema';
import type { MetadataFieldDescriptor } from '../types';

const baseField = (
  key: string,
  schema: Record<string, unknown>,
): MetadataFieldDescriptor => ({
  id: `id-${key}`,
  key,
  label: key.toUpperCase(),
  displayOrder: 0,
  jsonSchema: schema,
});

describe('buildFormFieldsFromSchema', () => {
  it.each([
    [{ type: 'string' }, 'string'],
    [{ type: 'string', enum: ['a', 'b'] }, 'enum'],
    [{ type: 'string', format: 'date' }, 'date'],
    [{ type: 'number' }, 'number'],
    [{ type: 'boolean' }, 'boolean'],
    [
      { type: 'array', items: { type: 'string', enum: ['x', 'y'] } },
      'enum_list',
    ],
  ])('maps %j → uiType %s', (schema, expectedUiType) => {
    const [form] = buildFormFieldsFromSchema([baseField('k', schema)]);
    expect(form?.uiType).toBe(expectedUiType);
  });

  it('extracts options for enum and enum_list, omits them otherwise', () => {
    const [stringField] = buildFormFieldsFromSchema([
      baseField('s', { type: 'string' }),
    ]);
    expect(stringField?.options).toBeUndefined();

    const [enumField] = buildFormFieldsFromSchema([
      baseField('t', { type: 'string', enum: ['a', 'b'] }),
    ]);
    expect(enumField?.options).toHaveLength(2);
  });

  it('marks fields as required when their key is in the parent required list', () => {
    const [a, b] = buildFormFieldsFromSchema(
      [
        baseField('a', { type: 'string' }),
        baseField('b', { type: 'string' }),
      ],
      ['b'],
    );
    expect(a?.required).toBe(false);
    expect(b?.required).toBe(true);
  });

  it('preserves the field id / key / label verbatim from descriptor', () => {
    const [form] = buildFormFieldsFromSchema([
      baseField('region', { type: 'string' }),
    ]);
    expect(form).toMatchObject({
      id: 'id-region',
      key: 'region',
      label: 'REGION',
    });
  });
});
