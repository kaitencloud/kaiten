import { act, renderHook } from '@testing-library/react';
import { vi } from 'vite-plus/test';
import type { FilterFieldDefinition } from '../types/filter.types';
import { useFilterBuilder } from '../hooks/use-filter-builder';

vi.mock('@/lib/debounce', () => ({
  debounce: (fn: (...args: unknown[]) => unknown) =>
    Object.assign((...args: unknown[]) => fn(...args), {
      cancel: vi.fn(),
    }),
}));

type User = {
  name: string;
  status: 'active' | 'inactive';
};

const users: User[] = [
  { name: 'Alice', status: 'active' },
  { name: 'Bob', status: 'inactive' },
  { name: 'Allan', status: 'active' },
];

const fields: FilterFieldDefinition<User>[] = [
  {
    id: 'name',
    label: 'Name',
    type: 'text',
    accessor: (user) => user.name,
  },
  {
    id: 'status',
    label: 'Status',
    type: 'enum',
    accessor: (user) => user.status,
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Inactive', value: 'inactive' },
    ],
  },
];

describe('useFilterBuilder', () => {
  it('should initialize with default normal filters', () => {
    const { result } = renderHook(() =>
      useFilterBuilder({
        data: users,
        fields,
        defaultNormalFilterIds: ['name'],
      }),
    );

    expect(result.current.normal.activeFilterIds).toEqual(['name']);
    expect(result.current.filteredData).toEqual(users);
  });

  it('should filter from normal and advanced rules together', () => {
    const { result } = renderHook(() =>
      useFilterBuilder({
        data: users,
        fields,
        defaultNormalFilterIds: ['name'],
      }),
    );

    act(() => {
      result.current.normal.setValue('name', 'al');
      result.current.advanced.addRule('status');
    });

    const createdRule = result.current.advanced.rules[0];
    expect(createdRule).toBeDefined();

    act(() => {
      result.current.advanced.updateRule(createdRule.id, {
        operator: 'is',
        value: 'active',
      });
    });

    expect(result.current.filteredData).toEqual([
      { name: 'Alice', status: 'active' },
      { name: 'Allan', status: 'active' },
    ]);
  });

  it('should remove values when a normal filter is removed', () => {
    const { result } = renderHook(() =>
      useFilterBuilder({
        data: users,
        fields,
        defaultNormalFilterIds: ['name'],
      }),
    );

    act(() => {
      result.current.normal.setValue('name', 'alice');
    });

    expect(result.current.normal.values.name).toBe('alice');

    act(() => {
      result.current.normal.removeFilter('name');
    });

    expect(result.current.normal.values.name).toBeUndefined();
  });

  it('should keep pinned filters always available and out of selectable filters', () => {
    const { result } = renderHook(() =>
      useFilterBuilder({
        data: users,
        fields,
        pinnedFilterIds: ['name'],
      }),
    );

    expect(result.current.normal.pinnedFilterIds).toEqual(['name']);
    expect(result.current.normal.pinnedFields.map((field) => field.id)).toEqual([
      'name',
    ]);
    expect(result.current.normal.activeFilterIds).toEqual([]);
    expect(result.current.normal.availableFields.map((field) => field.id)).toEqual([
      'status',
    ]);

    act(() => {
      result.current.normal.addFilter('name');
    });

    expect(result.current.normal.activeFilterIds).toEqual([]);
  });

  it('should ignore pinned ids from default normal filters', () => {
    const { result } = renderHook(() =>
      useFilterBuilder({
        data: users,
        fields,
        pinnedFilterIds: ['name'],
        defaultNormalFilterIds: ['name', 'status'],
      }),
    );

    expect(result.current.normal.activeFilterIds).toEqual(['status']);
  });

  it('should expose quick access filters and exclude them from selectable filters', () => {
    const quickAccessFields: FilterFieldDefinition<User>[] = [
      fields[0],
      {
        ...fields[1],
        quickAccess: true,
      },
    ];

    const { result } = renderHook(() =>
      useFilterBuilder({
        data: users,
        fields: quickAccessFields,
      }),
    );

    expect(result.current.normal.quickAccessFilterIds).toEqual(['status']);
    expect(
      result.current.normal.quickAccessFields.map((field) => field.id),
    ).toEqual(['status']);
    expect(result.current.normal.availableFields.map((field) => field.id)).toEqual(
      ['name'],
    );

    act(() => {
      result.current.normal.addFilter('status');
    });

    expect(result.current.normal.activeFilterIds).toEqual([]);
  });

  it('should clear quick access values on reset without removing quick access filters', () => {
    const quickAccessFields: FilterFieldDefinition<User>[] = [
      fields[0],
      {
        ...fields[1],
        quickAccess: true,
      },
    ];

    const { result } = renderHook(() =>
      useFilterBuilder({
        data: users,
        fields: quickAccessFields,
        defaultNormalFilterIds: ['name'],
      }),
    );

    act(() => {
      result.current.normal.setValue('name', 'ali');
      result.current.normal.setValue('status', 'active');
    });

    expect(result.current.hasActiveFilters).toBe(true);

    act(() => {
      result.current.resetAll();
    });

    expect(result.current.normal.values.name).toBeUndefined();
    expect(result.current.normal.values.status).toBeUndefined();
    expect(result.current.normal.quickAccessFilterIds).toEqual(['status']);
    expect(result.current.filteredData).toEqual(users);
    expect(result.current.hasActiveFilters).toBe(false);
  });
});
