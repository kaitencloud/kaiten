import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import { useAppForm } from '@/hooks/form';

const OPTIONS = ['SEND', 'CHARGE'];

function Harness({ disabled = ['CHARGE'] }: { disabled?: string[] }) {
  const form = useAppForm({ defaultValues: { method: 'SEND' } });

  return (
    <form.AppField name="method">
      {(field) => (
        <field.SelectField
          getOptionLabel={(option) => `Method ${String(option)}`}
          isOptionDisabled={(option) => disabled.includes(String(option))}
          label="Collection"
          options={OPTIONS}
        />
      )}
    </form.AppField>
  );
}

describe('SelectField', () => {
  it('lists an option that cannot be chosen, and leaves it as it says', async () => {
    render(<Harness />);

    await userEvent.click(await screen.findByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Method CHARGE' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Method SEND' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('does not take an option that is disabled', async () => {
    render(<Harness />);
    await userEvent.click(await screen.findByRole('combobox'));

    await userEvent.click(await screen.findByRole('option', { name: 'Method CHARGE' }));

    expect(screen.getByRole('combobox')).toHaveTextContent('Method SEND');
  });

  it('disables nothing when it is not asked to', async () => {
    render(<Harness disabled={[]} />);
    await userEvent.click(await screen.findByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Method CHARGE' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
