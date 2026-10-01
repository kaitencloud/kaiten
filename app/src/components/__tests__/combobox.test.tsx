import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { Combobox } from '../combobox';

const customerOptions = [
  { id: 'customer-1', name: 'Acme Corp' },
  { id: 'customer-2', name: 'Globex' },
];

describe('Combobox', () => {
  it('filters options by their visible label', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();

    render(
      <Combobox
        options={customerOptions}
        value=""
        onSelect={handleSelect}
        placeholder="Select a customer"
        searchPlaceholder="Search for a customer"
        getOptionLabel={(customer) => customer.name}
        getOptionValue={(customer) => customer.id}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /select a customer/i }),
    );
    await user.type(screen.getByPlaceholderText('Search for a customer'), 'acm');

    const option = screen.getByRole('option', { name: /acme corp/i });
    expect(option).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /globex/i }),
    ).not.toBeInTheDocument();

    await user.click(option);

    expect(handleSelect).toHaveBeenCalledWith('customer-1');
  });

  // Selecting is otherwise one-way: the list only offers the other options, so
  // an optional field had no way back to "none" once a value was picked.
  it('takes the value back to empty when clearable', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();

    render(
      <Combobox
        clearable
        clearLabel="No customer"
        options={customerOptions}
        value="customer-1"
        onSelect={handleSelect}
        placeholder="Select a customer"
        searchPlaceholder="Search for a customer"
        getOptionLabel={(customer) => customer.name}
        getOptionValue={(customer) => customer.id}
      />,
    );

    await user.click(screen.getByRole('button', { name: /acme corp/i }));
    await user.click(screen.getByRole('option', { name: /no customer/i }));

    expect(handleSelect).toHaveBeenCalledWith('');
  });

  it('offers no clear entry while nothing is selected', async () => {
    const user = userEvent.setup();

    render(
      <Combobox
        clearable
        clearLabel="No customer"
        options={customerOptions}
        value=""
        onSelect={vi.fn()}
        placeholder="Select a customer"
        searchPlaceholder="Search for a customer"
        getOptionLabel={(customer) => customer.name}
        getOptionValue={(customer) => customer.id}
      />,
    );

    await user.click(screen.getByRole('button', { name: /select a customer/i }));

    expect(
      screen.queryByRole('option', { name: /no customer/i }),
    ).not.toBeInTheDocument();
  });

  it('offers no clear entry unless clearable is set', async () => {
    const user = userEvent.setup();

    render(
      <Combobox
        options={customerOptions}
        value="customer-1"
        onSelect={vi.fn()}
        placeholder="Select a customer"
        searchPlaceholder="Search for a customer"
        getOptionLabel={(customer) => customer.name}
        getOptionValue={(customer) => customer.id}
      />,
    );

    await user.click(screen.getByRole('button', { name: /acme corp/i }));

    expect(screen.getAllByRole('option')).toHaveLength(customerOptions.length);
  });

  it('commits a free-form value when allowCustomValue is enabled', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();

    render(
      <Combobox
        allowCustomValue
        options={customerOptions}
        value=""
        onSelect={handleSelect}
        placeholder="Select a customer"
        searchPlaceholder="Search for a customer"
        getOptionLabel={(customer) => customer.name}
        getOptionValue={(customer) => customer.id}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /select a customer/i }),
    );
    await user.type(
      screen.getByPlaceholderText('Search for a customer'),
      'Enterprise',
    );

    // No suggestion matches "Enterprise" — only the synthetic create option
    // remains, and selecting it commits the raw typed value.
    const createOption = screen.getByRole('option');
    await user.click(createOption);

    expect(handleSelect).toHaveBeenCalledWith('Enterprise');
  });

  it('does not offer a free-form value without allowCustomValue', async () => {
    const user = userEvent.setup();

    render(
      <Combobox
        options={customerOptions}
        value=""
        onSelect={() => undefined}
        placeholder="Select a customer"
        searchPlaceholder="Search for a customer"
        getOptionLabel={(customer) => customer.name}
        getOptionValue={(customer) => customer.id}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /select a customer/i }),
    );
    await user.type(
      screen.getByPlaceholderText('Search for a customer'),
      'Enterprise',
    );

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('disables the trigger when the field is locked', async () => {
    const user = userEvent.setup();

    render(
      <Combobox
        disabled
        options={customerOptions}
        value="customer-1"
        onSelect={() => undefined}
        placeholder="Select a customer"
        searchPlaceholder="Search for a customer"
        getOptionLabel={(customer) => customer.name}
        getOptionValue={(customer) => customer.id}
      />,
    );

    const trigger = screen.getByRole('button', { name: /acme corp/i });

    expect(trigger).toBeDisabled();

    await user.click(trigger);

    expect(
      screen.queryByPlaceholderText('Search for a customer'),
    ).not.toBeInTheDocument();
  });
});
