import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import {
  clearPicker,
  pickDay,
  pickerValue,
} from '@/test-fixtures/date-picker-test-support';
import { FilterValueInput } from '../components/shared/filter-toolbar-value-input';
import type { FilterFieldDefinition } from '../types/filter.types';

beforeAll(() => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
});

afterAll(() => {
  testI18n.removeResourceBundle('en', 'translation');
});

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

  it('names a date filter after its field, whatever day it holds', () => {
    renderField({
      accessor: (customer) => customer.createdAt,
      id: 'createdAt',
      label: 'Created at',
      type: 'date',
    });

    const picker = screen.getByRole('button', { name: 'Filter by Created at' });

    expect(picker).toHaveAttribute('data-value', '');
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });

  it('hands the day picked on the calendar to the filter as the text a date input held', async () => {
    const onValueChange = vi.fn();
    render(
      <FilterValueInput
        field={{
          accessor: (customer: Customer) => customer.createdAt,
          id: 'createdAt',
          label: 'Created at',
          type: 'date',
        }}
        labels={labels}
        onValueChange={onValueChange}
        value=""
      />,
    );

    await pickDay(
      userEvent.setup(),
      screen.getByRole('button', { name: 'Filter by Created at' }),
      '2026-03-01',
    );

    expect(onValueChange).toHaveBeenCalledWith('2026-03-01');
  });

  it('shows the day it holds, and clears it to the empty text', async () => {
    const onValueChange = vi.fn();
    render(
      <FilterValueInput
        field={{
          accessor: (customer: Customer) => customer.createdAt,
          id: 'createdAt',
          label: 'Created at',
          type: 'date',
        }}
        labels={labels}
        onValueChange={onValueChange}
        value="2026-03-01"
      />,
    );
    const picker = screen.getByRole('button', { name: 'Filter by Created at' });

    expect(pickerValue(picker)).toBe('2026-03-01');

    await clearPicker(userEvent.setup(), picker);

    expect(onValueChange).toHaveBeenCalledWith('');
  });
});
