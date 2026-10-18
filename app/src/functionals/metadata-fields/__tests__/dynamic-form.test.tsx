import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import {
  clearPicker,
  pickDay,
  pickerValue,
} from '@/test-fixtures/date-picker-test-support';
import { TEST_ZONES, useTimeZone } from '@/test-fixtures/time-zone';
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

const dateField: MetadataFormField = {
  id: 'id-renewal',
  key: 'renewal',
  label: 'Renewal',
  uiType: 'date',
  jsonSchema: { type: 'string', format: 'date' },
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

describe('<DynamicForm> date field', () => {
  beforeAll(() => {
    testI18n.addResourceBundle('en', 'translation', en, true, true);
  });

  afterAll(() => {
    testI18n.removeResourceBundle('en', 'translation');
  });

  it('shows the day it holds and drops the key when it is cleared', async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <DynamicForm
        fields={[dateField]}
        value={{ renewal: '2026-03-01' }}
        onChange={onChange}
      />,
    );

    expect(pickerValue(getByLabelText('Renewal'))).toBe('2026-03-01');

    await clearPicker(userEvent.setup(), getByLabelText('Renewal'));

    const next = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(next.renewal).toBeUndefined();
  });
});

describe.each(TEST_ZONES)('<DynamicForm> date field in $zone', ({ zone, utcMoment }) => {
  useTimeZone(zone, utcMoment);

  beforeAll(() => {
    testI18n.addResourceBundle('en', 'translation', en, true, true);
  });

  afterAll(() => {
    testI18n.removeResourceBundle('en', 'translation');
  });

  it.each(['2026-03-01', '2026-12-31'])('stores the day %s that was picked', async (day) => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <DynamicForm fields={[dateField]} value={{}} onChange={onChange} />,
    );

    await pickDay(userEvent.setup(), getByLabelText('Renewal'), day);

    expect(onChange).toHaveBeenLastCalledWith({ renewal: day });
  });
});
