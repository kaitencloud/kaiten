import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { FilterValueInput } from '../components/shared/filter-toolbar-value-input';
import type { FilterFieldDefinition } from '../types/filter.types';

type Customer = { createdAt: string; name: string; status: string };

const labels = {
  all: 'All',
  falseValue: 'No',
  filterBy: 'Filter by:',
  filterFieldPlaceholder: 'Filter {{field}}...',
  trueValue: 'Yes',
};

function renderField(field: FilterFieldDefinition<Customer>) {
  return render(
    <FilterValueInput
      field={field}
      value=""
      onValueChange={vi.fn()}
      labels={labels}
    />,
  );
}

describe('FilterValueInput', () => {
  it('leaves a text filter named by its placeholder, which already says what it filters', () => {
    renderField({
      accessor: (customer) => customer.name,
      id: 'name',
      label: 'Name',
      placeholder: 'Name',
      type: 'text',
    });

    // Browsers name the input from its placeholder (jsdom's name computation
    // does not): no label on top, or it would read like a form field.
    expect(screen.getByPlaceholderText('Name')).not.toHaveAttribute(
      'aria-label',
    );
  });

  it('names a select filter after its field, not the value it shows', () => {
    renderField({
      accessor: (customer) => customer.status,
      id: 'status',
      label: 'Status',
      options: [{ label: 'Active', value: 'ACTIVE' }],
      type: 'enum',
    });

    expect(
      screen.getByRole('combobox', { name: 'Filter by Status' }),
    ).toBeInTheDocument();
  });

  it('names a date filter after its field', () => {
    const { container } = renderField({
      accessor: (customer) => customer.createdAt,
      id: 'createdAt',
      label: 'Created at',
      type: 'date',
    });

    expect(container.querySelector('input[type="date"]')).toHaveAttribute(
      'aria-label',
      'Filter by Created at',
    );
  });
});
