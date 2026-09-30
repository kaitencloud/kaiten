import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { FilterOptionList } from '../components/shared/filter-option-list';
import { FILTER_MULTI_SELECT_SEPARATOR } from '../constants';
import type { FilterFieldDefinition } from '../types/filter.types';

type Notification = { objectType: string; status: string; read: boolean };

const labels = {
  all: 'All',
  clearFilter: 'Clear filter',
  falseValue: 'No',
  filterFieldPlaceholder: 'Filter {{field}}...',
  noResult: 'No results',
  trueValue: 'Yes',
};

const objectField: FilterFieldDefinition<Notification> = {
  accessor: (notification) => [notification.objectType],
  id: 'objectType',
  label: 'Object',
  options: [
    { label: 'Instance', value: 'instance' },
    { label: 'Customer', value: 'customer' },
    { label: 'Release', value: 'release' },
  ],
  type: 'enum_list',
};

const statusField: FilterFieldDefinition<Notification> = {
  accessor: (notification) => notification.status,
  id: 'status',
  label: 'Status',
  options: [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Churned', value: 'CHURNED' },
  ],
  type: 'enum',
};

function renderList(
  field: FilterFieldDefinition<Notification>,
  value = '',
) {
  const onValueChange = vi.fn();
  const onChosen = vi.fn();
  render(
    <FilterOptionList
      field={field}
      value={value}
      labels={labels}
      onValueChange={onValueChange}
      onChosen={onChosen}
    />,
  );

  return { onChosen, onValueChange };
}

// cmdk scrolls the active item into view, which jsdom does not implement.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('FilterOptionList', () => {
  it('opens straight onto the options, with no search box unless the field asks for one', () => {
    renderList(objectField);

    expect(screen.getByRole('option', { name: 'Instance' })).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows a search box for a searchable field, and narrows the options with it', () => {
    renderList({ ...objectField, searchable: true });

    const search = screen.getByPlaceholderText('Filter Object...');
    fireEvent.change(search, { target: { value: 'cust' } });

    expect(screen.getByRole('option', { name: 'Customer' })).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Release' }),
    ).not.toBeInTheDocument();
  });

  it('keeps only the options holding every word typed, where a fuzzy match would keep more', () => {
    renderList({
      ...objectField,
      options: [
        { label: 'https://ops.acme.io/webhooks/kaiten', value: 'hook-1' },
        {
          label: 'https://hooks.billing.example.com/kaiten/events',
          value: 'hook-2',
        },
        { label: 'https://internal.example.org/api/incoming', value: 'hook-3' },
      ],
      searchable: true,
    });
    const search = screen.getByPlaceholderText('Filter Object...');
    const shown = () =>
      screen.getAllByRole('option').map((option) => option.textContent);

    // "acme" is also a-c-m-e in order in hook-2 ("example.com/kaiten/events").
    fireEvent.change(search, { target: { value: 'acme' } });
    expect(shown()).toEqual(['https://ops.acme.io/webhooks/kaiten']);

    fireEvent.change(search, { target: { value: 'kaiten example' } });
    expect(shown()).toEqual([
      'https://hooks.billing.example.com/kaiten/events',
    ]);
  });

  it('toggles a multi-choice option and stays open', () => {
    const { onChosen, onValueChange } = renderList(objectField, 'instance');

    expect(screen.getByRole('option', { name: 'Instance' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('option', { name: 'Customer' }));
    expect(onValueChange).toHaveBeenLastCalledWith(
      ['customer', 'instance'].join(FILTER_MULTI_SELECT_SEPARATOR),
    );

    fireEvent.click(screen.getByRole('option', { name: 'Instance' }));
    expect(onValueChange).toHaveBeenLastCalledWith('');
    expect(onChosen).not.toHaveBeenCalled();
  });

  it('clears a multi-choice selection from the foot of the list', () => {
    const { onValueChange } = renderList(objectField, 'instance');

    fireEvent.click(screen.getByRole('option', { name: 'Clear filter' }));

    expect(onValueChange).toHaveBeenLastCalledWith('');
  });

  it('picks a single choice and closes, and "All" clears it', () => {
    const { onChosen, onValueChange } = renderList(statusField, 'ACTIVE');

    expect(screen.getByRole('option', { name: 'Active' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('option', { name: 'Churned' }));
    expect(onValueChange).toHaveBeenLastCalledWith('CHURNED');
    expect(onChosen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('option', { name: 'All' }));
    expect(onValueChange).toHaveBeenLastCalledWith('');
    expect(onChosen).toHaveBeenCalledTimes(2);
  });

  const readField: FilterFieldDefinition<Notification> = {
    accessor: (notification) => notification.read,
    id: 'read',
    label: 'Read',
    type: 'boolean',
  };

  it('offers true and false for a boolean field, and no "All"', () => {
    const { onChosen, onValueChange } = renderList(readField);

    expect(screen.getByRole('option', { name: 'Yes' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'No' })).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'All' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Yes' }));
    expect(onValueChange).toHaveBeenLastCalledWith('true');
    expect(onChosen).toHaveBeenCalledTimes(1);
  });

  it('clears a boolean by picking its value again, or from the foot of the list', () => {
    const { onValueChange } = renderList(readField, 'true');

    fireEvent.click(screen.getByRole('option', { name: 'Yes' }));
    expect(onValueChange).toHaveBeenLastCalledWith('');

    fireEvent.click(screen.getByRole('option', { name: 'Clear filter' }));
    expect(onValueChange).toHaveBeenLastCalledWith('');
  });
});
