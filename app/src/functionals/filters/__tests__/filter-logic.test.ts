import {
  applyFilterModel,
  getDefaultOperatorForFieldType,
  getOperatorsForFieldType,
} from '../logic/filter-logic';
import type { FilterFieldDefinition, FilterModel } from '../types/filter.types';

type Employee = {
  name: string;
  email: string;
  status: 'active' | 'pending' | 'inactive';
  enabled: boolean;
  score: number;
  joinDate: string;
  tags: string[];
};

const sampleEmployees: Employee[] = [
  {
    name: 'Zaid Farouk',
    email: 'zaid.farouk@work.co',
    status: 'pending',
    enabled: true,
    score: 80,
    joinDate: '2021-08-21',
    tags: ['enterprise', 'design'],
  },
  {
    name: 'Emma Mustafa',
    email: 'emma.mustafa@org.net',
    status: 'active',
    enabled: true,
    score: 95,
    joinDate: '2021-03-08',
    tags: ['trial', 'engineering'],
  },
  {
    name: 'James Williams',
    email: 'james.williams@company.com',
    status: 'inactive',
    enabled: false,
    score: 40,
    joinDate: '2023-07-21',
    tags: ['enterprise', 'engineering'],
  },
];

const fields: FilterFieldDefinition<Employee>[] = [
  {
    id: 'name',
    label: 'Name',
    type: 'text',
    accessor: (employee) => employee.name,
  },
  {
    id: 'status',
    label: 'Status',
    type: 'enum',
    accessor: (employee) => employee.status,
  },
  {
    id: 'enabled',
    label: 'Enabled',
    type: 'boolean',
    accessor: (employee) => employee.enabled,
  },
  {
    id: 'score',
    label: 'Score',
    type: 'number',
    accessor: (employee) => employee.score,
  },
  {
    id: 'joinDate',
    label: 'Join Date',
    type: 'date',
    accessor: (employee) => employee.joinDate,
  },
  {
    id: 'tags',
    label: 'Tags',
    type: 'enum',
    accessor: (employee) => employee.tags,
  },
];

const emptyModel: FilterModel = {
  normal: {
    activeFilterIds: [],
    values: {},
  },
  advanced: {
    combinator: 'and',
    rules: [],
  },
};

describe('filter-logic', () => {
  it('should expose valid operators per field type', () => {
    expect(getDefaultOperatorForFieldType('text')).toBe('contains');
    expect(getDefaultOperatorForFieldType('enum')).toBe('is');
    expect(getOperatorsForFieldType('number')).toContain('gte');
    expect(getOperatorsForFieldType('boolean')).toEqual(['is', 'is_not']);
  });

  it('should apply normal text filters', () => {
    const model: FilterModel = {
      ...emptyModel,
      normal: {
        activeFilterIds: ['name'],
        values: { name: 'emma' },
      },
    };

    const result = applyFilterModel(sampleEmployees, fields, model);
    expect(result).toEqual([sampleEmployees[1]]);
  });

  it('should apply advanced filters with and combinator', () => {
    const model: FilterModel = {
      ...emptyModel,
      advanced: {
        combinator: 'and',
        rules: [
          {
            id: '1',
            fieldId: 'status',
            operator: 'is',
            value: 'active',
          },
          {
            id: '2',
            fieldId: 'enabled',
            operator: 'is',
            value: 'true',
          },
        ],
      },
    };

    const result = applyFilterModel(sampleEmployees, fields, model);
    expect(result).toEqual([sampleEmployees[1]]);
  });

  it('should apply advanced filters with or combinator', () => {
    const model: FilterModel = {
      ...emptyModel,
      advanced: {
        combinator: 'or',
        rules: [
          {
            id: '1',
            fieldId: 'status',
            operator: 'is',
            value: 'inactive',
          },
          {
            id: '2',
            fieldId: 'score',
            operator: 'gte',
            value: '90',
          },
        ],
      },
    };

    const result = applyFilterModel(sampleEmployees, fields, model);
    expect(result).toEqual([sampleEmployees[1], sampleEmployees[2]]);
  });

  it('should combine normal and advanced filters', () => {
    const model: FilterModel = {
      normal: {
        activeFilterIds: ['name'],
        values: { name: 'zaid' },
      },
      advanced: {
        combinator: 'and',
        rules: [
          {
            id: '1',
            fieldId: 'status',
            operator: 'is',
            value: 'pending',
          },
        ],
      },
    };

    const result = applyFilterModel(sampleEmployees, fields, model);
    expect(result).toEqual([sampleEmployees[0]]);
  });

  it('should support enum filters on array values', () => {
    const model: FilterModel = {
      ...emptyModel,
      normal: {
        activeFilterIds: ['tags'],
        values: { tags: 'engineering' },
      },
    };

    const result = applyFilterModel(sampleEmployees, fields, model);
    expect(result).toEqual([sampleEmployees[1], sampleEmployees[2]]);
  });
});
