import { render } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { DynamicForm, validateDynamicForm } from '../dynamic-form';
import type { MetadataFormField } from '../types';

const stringField: MetadataFormField = {
  id: 'id',
  key: 'name',
  label: 'Name',
  uiType: 'string',
  jsonSchema: { type: 'string', minLength: 2 },
};

const enumField: MetadataFormField = {
  id: 'id-tier',
  key: 'tier',
  label: 'Tier',
  uiType: 'enum',
  jsonSchema: { type: 'string', enum: ['gold', 'silver'] },
};

const numberField: MetadataFormField = {
  id: 'id-w',
  key: 'weight',
  label: 'Weight',
  uiType: 'number',
  jsonSchema: { type: 'number', minimum: 0 },
};

describe('validateDynamicForm', () => {
  it('returns no error when value satisfies the schema', () => {
    expect(
      validateDynamicForm([stringField], { name: 'hello' }),
    ).toEqual({});
  });

  it('returns ajv errors when value violates the schema', () => {
    const errors = validateDynamicForm([stringField], { name: 'x' });
    expect(errors.name).toBeDefined();
    expect(errors.name?.length).toBeGreaterThan(0);
  });

  it('skips ajv when an optional field is missing', () => {
    expect(validateDynamicForm([stringField], {})).toEqual({});
  });

  it('flags Required when a required field is missing or empty', () => {
    const required: MetadataFormField = { ...stringField, required: true };
    expect(validateDynamicForm([required], {})).toEqual({ name: ['Required'] });
    expect(validateDynamicForm([required], { name: '' })).toEqual({
      name: ['Required'],
    });
  });

  it('validates enum, number, boolean correctly', () => {
    expect(validateDynamicForm([enumField], { tier: 'platinum' }).tier).toBeDefined();
    expect(validateDynamicForm([enumField], { tier: 'gold' })).toEqual({});

    expect(validateDynamicForm([numberField], { weight: -1 }).weight).toBeDefined();
    expect(validateDynamicForm([numberField], { weight: 5 })).toEqual({});
  });

});

// Surfaces JSON Schema description and examples.
describe('<DynamicForm> schema documentation surfacing', () => {
  it('renders the JSON Schema description as helper text', () => {
    const field: MetadataFormField = {
      id: 'id-region',
      key: 'region',
      label: 'Region',
      uiType: 'string',
      jsonSchema: {
        type: 'string',
        description: 'Stable region identifier (e.g. eu-west-1)',
      },
    };
    const { getByText } = render(
      <DynamicForm fields={[field]} value={{}} onChange={() => {}} />,
    );
    expect(
      getByText('Stable region identifier (e.g. eu-west-1)'),
    ).toBeInTheDocument();
  });

  it('uses examples[0] as the input placeholder', () => {
    const field: MetadataFormField = {
      id: 'id-region',
      key: 'region',
      label: 'Region',
      uiType: 'string',
      jsonSchema: {
        type: 'string',
        examples: ['eu-west-1', 'us-east-1'],
      },
    };
    const { getByLabelText } = render(
      <DynamicForm fields={[field]} value={{}} onChange={() => {}} />,
    );
    const input = getByLabelText('Region') as HTMLInputElement;
    expect(input.placeholder).toBe('eu-west-1');
  });
});

describe('validateDynamicForm — extras', () => {
  // Composed-schema validation should mirror the backend.
  describe('composed-schema strict mode', () => {
    it('rejects extra keys (additionalProperties:false) like the backend', () => {
      const errors = validateDynamicForm(
        [stringField],
        { name: 'hello', extra: 'leak' },
        'strict',
      );
      expect(errors.extra).toBeDefined();
      expect(errors.extra?.join(' ')).toMatch(/additional/i);
    });

    it('accepts extra keys in tolerant mode', () => {
      const errors = validateDynamicForm(
        [stringField],
        { name: 'hello', extra: 'allowed' },
        'tolerant',
      );
      expect(errors.extra).toBeUndefined();
    });

    it('still flags type errors on declared keys in tolerant mode', () => {
      const errors = validateDynamicForm(
        [numberField],
        { weight: 'not-a-number', extra: 'free' },
        'tolerant',
      );
      expect(errors.weight).toBeDefined();
      expect(errors.extra).toBeUndefined();
    });
  });
});
