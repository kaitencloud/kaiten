import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import { useAppForm } from '@/hooks/form';

const OPTIONS = ['EUR', 'USD'];

function Harness() {
  const form = useAppForm({ defaultValues: { currency: '' } });

  return (
    <form.AppField name="currency">
      {(field) => (
        <field.ComboboxField
          description="Charged in this currency"
          getOptionLabel={String}
          getOptionValue={String}
          label="Currency"
          options={OPTIONS}
          placeholder="Pick a currency"
          searchPlaceholder="Search a currency"
        />
      )}
    </form.AppField>
  );
}

describe('ComboboxField', () => {
  it('is named by its label ahead of what it shows, and described by its help', () => {
    render(<Harness />);

    const trigger = screen.getByRole('button', {
      name: 'Currency Pick a currency',
    });

    expect(screen.getByText('Currency')).toHaveAttribute('for', trigger.id);
    expect(trigger).toHaveAccessibleDescription('Charged in this currency');
  });

  it('keeps the name of the field once a value is chosen', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: /^Currency/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'USD' }));

    expect(
      screen.getByRole('button', { name: 'Currency USD' }),
    ).toBeInTheDocument();
  });

  it('names the list it opens', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: /^Currency/ }));

    expect(
      await screen.findByRole('listbox', { name: 'Search a currency' }),
    ).toBeInTheDocument();
  });
});
