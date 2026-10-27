import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { StepNextButton } from '../step-next-button';

describe('StepNextButton', () => {
  it('says why it cannot go on while the step is not complete', () => {
    render(
      <StepNextButton disabled onClick={vi.fn()}>
        Next
      </StepNextButton>,
    );

    const button = screen.getByRole('button', { name: 'Next' });
    expect(button).toBeDisabled();
    // The test translations answer with the key.
    expect(button).toHaveAccessibleDescription('Common.nextBlocked');
  });

  it('has nothing to say once the step is complete, and goes on when it is pressed', () => {
    const onClick = vi.fn();
    render(
      <StepNextButton disabled={false} onClick={onClick}>
        Next
      </StepNextButton>,
    );

    const button = screen.getByRole('button', { name: 'Next' });
    button.click();

    expect(button).toBeEnabled();
    expect(button).not.toHaveAccessibleDescription();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
