import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import { useAppForm } from '@/hooks/form';

function Harness({
  autoComplete,
  type,
}: {
  autoComplete?: string;
  type?: 'password' | 'text';
}) {
  const form = useAppForm({ defaultValues: { secret: '' } });

  return (
    <>
      <form.AppField name="secret">
        {(field) => (
          <field.TextField
            autoComplete={autoComplete}
            label="Secret"
            type={type}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.secret}>
        {(secret) => <output aria-label="Held by the form">{secret}</output>}
      </form.Subscribe>
    </>
  );
}

describe('TextField', () => {
  it('is a plain text input unless it is told otherwise', async () => {
    render(<Harness autoComplete="username" />);

    const input = await screen.findByLabelText('Secret');

    expect(input).not.toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'username');
  });

  it('hides a secret as it is typed, tells the browser not to offer it again, and still gives it to the form', async () => {
    render(<Harness autoComplete="username" type="password" />);

    const input = await screen.findByLabelText('Secret');
    await userEvent.type(input, 'rk_test_51Habc');

    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Held by the form')).toHaveTextContent(
      'rk_test_51Habc',
    );
  });
});
