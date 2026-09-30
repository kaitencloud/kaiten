import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { ProgressStepper } from '../progress-stepper';

const steps = [
  { id: 'identity', label: 'Entitlement information' },
  { id: 'type', label: 'Type configuration' },
  { id: 'review', label: 'Review' },
];

describe('ProgressStepper', () => {
  it('numbers the steps and only goes back to a step already reached', () => {
    const onStepChange = vi.fn();
    render(
      <ProgressStepper
        activeStep={1}
        furthestStep={1}
        onStepChange={onStepChange}
        steps={steps}
      />,
    );

    const [first, second, third] = screen.getAllByRole('button');
    expect(first).toHaveTextContent('01Entitlement information');
    expect(second).toBeEnabled();
    expect(third).toBeDisabled();

    fireEvent.click(first);
    expect(onStepChange).toHaveBeenCalledWith(0);
  });
});
