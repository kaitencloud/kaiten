import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { useAppForm } from '@/hooks/form';

const schema = z.object({
  paidAt: z.string().refine((value) => value <= '2030-01-01T00:00', 'Tests.tooLate'),
});

function Harness() {
  const form = useAppForm({
    defaultValues: { paidAt: '' },
    validators: { onChange: schema },
  });

  return (
    <form.AppField name="paidAt">
      {(field) => (
        <field.DateTimeField
          description="Read as UTC."
          label="Paid at (UTC)"
        />
      )}
    </form.AppField>
  );
}

describe('DateTimeField', () => {
  it('is a date and a time control with its label and its help text', async () => {
    render(<Harness />);

    const input = await screen.findByLabelText('Paid at (UTC)');

    expect(input).toHaveAttribute('type', 'datetime-local');
    expect(input).toHaveValue('');
    expect(input).toHaveAccessibleDescription('Read as UTC.');
  });

  it('holds the text the control holds: a date, a time, no zone', async () => {
    render(<Harness />);

    const input = await screen.findByLabelText('Paid at (UTC)');
    await userEvent.type(input, '2027-03-03T10:00');

    expect(input).toHaveValue('2027-03-03T10:00');
  });

  it('says what is wrong with the value, beside the control', async () => {
    render(<Harness />);

    const input = await screen.findByLabelText('Paid at (UTC)');
    await userEvent.type(input, '2031-01-01T00:00');
    await userEvent.tab();

    expect(await screen.findByText('Tests.tooLate')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
