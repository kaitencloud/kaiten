import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { useAppForm } from '@/hooks/form';
import { isValidMajorAmount } from '@/lib/money';

type PriceGetter = () => string;

const schema = z.object({
  price: z
    .string()
    .refine((value) => isValidMajorAmount(value, 'USD'), 'Tests.invalidPrice'),
});

function Harness({ onReady }: { onReady?: (getter: PriceGetter) => void }) {
  const form = useAppForm({
    defaultValues: { price: '' },
    validators: { onChange: schema },
  });

  useEffect(() => {
    onReady?.(() => form.getFieldValue('price'));
  }, [form, onReady]);

  return (
    <form.AppField name="price">
      {(field) => (
        <field.MoneyField
          currency="USD"
          description="Per 1M tokens"
          label="Unit price"
          placeholder="0.00"
        />
      )}
    </form.AppField>
  );
}

describe('MoneyField', () => {
  it('shows the currency beside a decimal input', async () => {
    render(<Harness />);

    const input = await screen.findByLabelText('Unit price');

    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('Per 1M tokens')).toBeInTheDocument();
  });

  it('says the currency to whoever does not see it beside the input', async () => {
    render(<Harness />);

    const input = await screen.findByLabelText('Unit price');

    // The currency describes the input, with the help text, instead of being
    // text next to it that a screen reader meets only when it reads the page.
    expect(input).toHaveAccessibleDescription('Per 1M tokens USD');
  });

  it('keeps the currency in the description beside an error', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = await screen.findByLabelText('Unit price');
    await user.type(input, '12abc');
    await user.tab();

    await screen.findByText('Tests.invalidPrice');
    expect(input).toHaveAccessibleDescription(/Tests\.invalidPrice/);
    expect(input).toHaveAccessibleDescription(/USD/);
  });

  it('keeps what was typed as the string it is, so no decimal is lost', async () => {
    const user = userEvent.setup();
    let getPrice: PriceGetter | undefined;
    render(<Harness onReady={(getter) => (getPrice = getter)} />);

    await user.type(await screen.findByLabelText('Unit price'), '0.0750000001');

    expect(getPrice?.()).toBe('0.0750000001');
    expect(screen.getByLabelText('Unit price')).toHaveValue('0.0750000001');
  });

  it('shows the schema message once the field is touched and the amount is refused', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = await screen.findByLabelText('Unit price');
    await user.type(input, '12abc');
    await user.tab();

    expect(await screen.findByText('Tests.invalidPrice')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
