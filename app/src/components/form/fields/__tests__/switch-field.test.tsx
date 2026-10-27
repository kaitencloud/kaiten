import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import { useAppForm } from '@/hooks/form';

function Harness({
  disabled,
  initial = false,
}: {
  disabled?: boolean;
  initial?: boolean;
}) {
  const form = useAppForm({ defaultValues: { enabled: initial } });

  return (
    <>
      <form.AppField name="enabled">
        {(field) => (
          <field.SwitchField
            description="Turns the setting on for everyone."
            disabled={disabled}
            label="Setting"
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.enabled}>
        {(enabled) => (
          <output aria-label="Held by the form">{String(enabled)}</output>
        )}
      </form.Subscribe>
    </>
  );
}

describe('SwitchField', () => {
  it('is named by its label, described by its description, and off by default', async () => {
    render(<Harness />);

    const control = await screen.findByRole('switch', { name: 'Setting' });

    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(control).toHaveAccessibleDescription(
      'Turns the setting on for everyone.',
    );
  });

  it('gives the form the value it is turned to, both ways', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const control = await screen.findByRole('switch', { name: 'Setting' });

    await user.click(control);
    expect(control).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Held by the form')).toHaveTextContent('true');

    await user.click(control);
    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText('Held by the form')).toHaveTextContent('false');
  });

  it('opens on the value the form holds', async () => {
    render(<Harness initial />);

    expect(
      await screen.findByRole('switch', { name: 'Setting' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('cannot be turned when it is disabled, and says so', async () => {
    render(<Harness disabled />);
    const user = userEvent.setup();
    const control = await screen.findByRole('switch', { name: 'Setting' });

    await user.click(control);

    expect(control).toHaveAttribute('aria-disabled', 'true');
    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText('Held by the form')).toHaveTextContent('false');
  });
});
