import { describe, expect, it } from 'vite-plus/test';
import { getFilterBadgeLabel } from '../components/shared/filter-toolbar-utils';
import { FILTER_MULTI_SELECT_SEPARATOR } from '../constants';
import type { FilterFieldDefinition } from '../types/filter.types';

type Row = { name: string; objectType: string; enabled: boolean };

const labels = {
  falseValue: 'No',
  selectedCount: '{{count}} selected',
  trueValue: 'Yes',
};

const objectField: FilterFieldDefinition<Row> = {
  accessor: (row) => [row.objectType],
  id: 'objectType',
  label: 'Object',
  options: [
    { label: 'Instance', value: 'instance' },
    { label: 'Customer', value: 'customer' },
    { label: 'Release', value: 'release' },
  ],
  type: 'enum_list',
};

const pick = (...values: string[]) =>
  values.join(FILTER_MULTI_SELECT_SEPARATOR);

describe('getFilterBadgeLabel', () => {
  it('names a field picked from a list "Label: value", without its operator', () => {
    expect(getFilterBadgeLabel(objectField, pick('instance'), labels)).toBe(
      'Object: Instance',
    );
    expect(
      getFilterBadgeLabel(objectField, pick('instance', 'customer'), labels),
    ).toBe('Object: Instance, Customer');
  });

  it('counts a selection too long to list', () => {
    expect(
      getFilterBadgeLabel(
        objectField,
        pick('instance', 'customer', 'release'),
        labels,
      ),
    ).toBe('Object: 3 selected');
  });

  it('is the bare label while nothing is picked', () => {
    expect(getFilterBadgeLabel(objectField, '', labels)).toBe('Object');
  });

  it('shows a boolean by its labels', () => {
    expect(
      getFilterBadgeLabel(
        {
          accessor: (row: Row) => row.enabled,
          id: 'enabled',
          label: 'Enabled',
          type: 'boolean',
        },
        'true',
        labels,
      ),
    ).toBe('Enabled: Yes');
  });

  it('keeps the operator for a field typed in, where it says something', () => {
    expect(
      getFilterBadgeLabel(
        {
          accessor: (row: Row) => row.name,
          id: 'name',
          label: 'Name',
          type: 'text',
        },
        'acme',
        labels,
      ),
    ).toBe('Name contains acme');
  });
});
