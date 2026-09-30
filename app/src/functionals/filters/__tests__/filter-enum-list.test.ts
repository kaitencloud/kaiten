import { describe, expect, it } from 'vite-plus/test';
import { FILTER_MULTI_SELECT_SEPARATOR } from '../components/shared/filter-multi-select';
import { applyFilterModel } from '../logic/filter-logic';
import {
  FILTER_OPERATOR_LABELS,
  getDefaultOperatorForFieldType,
  getOperatorsForFieldType,
} from '../logic/filter-operator-config';
import type { FilterFieldDefinition, FilterModel } from '../types/filter.types';

const join = (values: string[]) => values.join(FILTER_MULTI_SELECT_SEPARATOR);

type Row = { id: string; labels: string[] };

const labelsField: FilterFieldDefinition<Row> = {
  id: 'labels',
  label: 'Labels',
  type: 'enum_list',
  accessor: (row) => row.labels,
  options: [
    { label: 'red', value: 'red' },
    { label: 'green', value: 'green' },
    { label: 'blue', value: 'blue' },
  ],
};

const emptyModel = (): FilterModel => ({
  normal: { activeFilterIds: [], values: {} },
  advanced: { combinator: 'and', rules: [] },
});

describe('enum_list filter operators', () => {
  const rows: Row[] = [
    { id: '1', labels: ['red'] },
    { id: '2', labels: ['red', 'green'] },
    { id: '3', labels: ['blue'] },
    { id: '4', labels: [] },
  ];

  it('exposes contains_any + contains_all as the operators for enum_list', () => {
    expect(getOperatorsForFieldType('enum_list')).toEqual([
      'contains_any',
      'contains_all',
    ]);
  });

  it('default operator for enum_list is contains_any', () => {
    expect(getDefaultOperatorForFieldType('enum_list')).toBe('contains_any');
  });

  it('labels include the new operators', () => {
    expect(FILTER_OPERATOR_LABELS.contains_any).toBeDefined();
    expect(FILTER_OPERATOR_LABELS.contains_all).toBeDefined();
  });

  it('contains_any: keeps rows whose array intersects the selection', () => {
    const model = emptyModel();
    model.advanced.rules = [
      {
        id: 'r1',
        fieldId: 'labels',
        operator: 'contains_any',
        value: join(['red', 'blue']),
      },
    ];
    const filtered = applyFilterModel(rows, [labelsField], model);
    expect(filtered.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('contains_all: keeps rows whose array is a superset of the selection', () => {
    const model = emptyModel();
    model.advanced.rules = [
      {
        id: 'r1',
        fieldId: 'labels',
        operator: 'contains_all',
        value: join(['red', 'green']),
      },
    ];
    const filtered = applyFilterModel(rows, [labelsField], model);
    expect(filtered.map((r) => r.id)).toEqual(['2']);
  });

  it('empty selection ⇒ no filter applied (all rows pass)', () => {
    const model = emptyModel();
    model.advanced.rules = [
      {
        id: 'r1',
        fieldId: 'labels',
        operator: 'contains_any',
        value: '',
      },
    ];
    const filtered = applyFilterModel(rows, [labelsField], model);
    expect(filtered.map((r) => r.id)).toEqual(['1', '2', '3', '4']);
  });

  it('enum values that contain a comma roundtrip correctly (US separator)', () => {
    type CommaRow = { id: string; labels: string[] };
    const commaField: FilterFieldDefinition<CommaRow> = {
      id: 'labels',
      label: 'Labels',
      type: 'enum_list',
      accessor: (row) => row.labels,
      options: [
        { label: 'red, blue', value: 'red, blue' },
        { label: 'green', value: 'green' },
      ],
    };
    const commaRows: CommaRow[] = [
      { id: 'A', labels: ['red, blue'] },
      { id: 'B', labels: ['green'] },
    ];

    const model = emptyModel();
    model.advanced.rules = [
      {
        id: 'r1',
        fieldId: 'labels',
        operator: 'contains_any',
        // \x1F is the canonical separator. With a CSV separator we'd see
        // ['red', 'blue'] which would falsely match nothing.
        value: 'red, blue',
      },
    ];
    const filtered = applyFilterModel(commaRows, [commaField], model);
    expect(filtered.map((r) => r.id)).toEqual(['A']);
  });

  it('rows whose field is empty are excluded when a selection is set', () => {
    const model = emptyModel();
    model.advanced.rules = [
      {
        id: 'r1',
        fieldId: 'labels',
        operator: 'contains_any',
        value: 'red',
      },
    ];
    const filtered = applyFilterModel(rows, [labelsField], model);
    expect(filtered.map((r) => r.id)).not.toContain('4');
  });
});
