import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { QuantityStepper } from '../quantity-stepper';

const LABELS = {
  decrease: 'One unit fewer',
  group: 'Quantity of seats',
  increase: 'One unit more',
};

const renderStepper = (
  props: Partial<Parameters<typeof QuantityStepper>[0]> = {},
) => {
  const onChange = vi.fn();
  render(<QuantityStepper labels={LABELS} onChange={onChange} value={2} {...props} />);

  return { onChange };
};

describe('the quantity stepper', () => {
  it('is a group named by what it counts, which shows the value', () => {
    renderStepper();

    expect(screen.getByRole('group', { name: 'Quantity of seats' })).toBeInTheDocument();
    expect(screen.getByTestId('quantity-value')).toHaveTextContent('2');
  });

  it('asks for the value one unit up or down, and leaves the change to the caller', async () => {
    const { onChange } = renderStepper();

    await userEvent.click(screen.getByRole('button', { name: 'One unit more' }));
    await userEvent.click(screen.getByRole('button', { name: 'One unit fewer' }));

    expect(onChange.mock.calls).toEqual([[3], [1]]);
    // It holds no state of its own: the value is the one it was given.
    expect(screen.getByTestId('quantity-value')).toHaveTextContent('2');
  });

  it('stops at one', async () => {
    const { onChange } = renderStepper({ value: 1 });

    expect(screen.getByRole('button', { name: 'One unit fewer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'One unit more' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'One unit fewer' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops at the most it is given, and goes on without one', async () => {
    const { onChange } = renderStepper({ max: 3, value: 3 });

    expect(screen.getByRole('button', { name: 'One unit more' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'One unit more' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has no most when it is given none', () => {
    renderStepper({ value: 5000 });

    expect(screen.getByRole('button', { name: 'One unit more' })).toBeEnabled();
  });

  it('turns both buttons off while it is disabled', () => {
    renderStepper({ disabled: true });

    expect(screen.getByRole('button', { name: 'One unit more' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'One unit fewer' })).toBeDisabled();
  });
});
