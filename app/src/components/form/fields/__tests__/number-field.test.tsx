import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import { useAppForm } from '@/hooks/form';

function Harness({ allowOutOfRange }: { allowOutOfRange?: boolean }) {
  const form = useAppForm({ defaultValues: { days: 30 } });

  return (
    <>
      <form.AppField name="days">
        {(field) => (
          <field.NumberField
            allowOutOfRange={allowOutOfRange}
            label="Days"
            max={365}
            min={0}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.days}>
        {(days) => <output aria-label="Held by the form">{days}</output>}
      </form.Subscribe>
    </>
  );
}

async function typeAndLeave(value: string) {
  const input = await screen.findByLabelText('Days');
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.tab();

  return input;
}

describe('NumberField', () => {
  it('brings a number typed past its bound back to the bound', async () => {
    render(<Harness />);

    const input = await typeAndLeave('400');

    expect(input).toHaveValue('365');
    expect(screen.getByLabelText('Held by the form')).toHaveTextContent('365');
  });

  it('keeps a number typed past its bound when it is asked to, for the schema to refuse in its own words', async () => {
    render(<Harness allowOutOfRange />);

    const input = await typeAndLeave('400');

    expect(input).toHaveValue('400');
    expect(screen.getByLabelText('Held by the form')).toHaveTextContent('400');
  });

  it('still stops the steppers at the bound', async () => {
    render(<Harness allowOutOfRange />);
    await typeAndLeave('365');

    await userEvent.click(screen.getByRole('button', { name: 'Increase value' }));

    expect(await screen.findByLabelText('Days')).toHaveValue('365');
    expect(screen.getByLabelText('Held by the form')).toHaveTextContent('365');
  });
});
