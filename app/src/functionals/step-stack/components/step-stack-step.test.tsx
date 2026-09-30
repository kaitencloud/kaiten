import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { StepStack } from './step-stack-root';
import { StepStackContainer } from './step-stack-container';
import { StepStackStep } from './step-stack-step';

function StepStackExample({ embedded = false }: { embedded?: boolean }) {
  return (
    <StepStack defaultIndex={1} embedded={embedded}>
      <StepStackContainer>
        <StepStackStep>
          <span>First step</span>
        </StepStackStep>
        <StepStackStep>
          <span>Second step</span>
        </StepStackStep>
      </StepStackContainer>
    </StepStack>
  );
}

function getStepPanel(label: string) {
  return screen.getByText(label).parentElement?.parentElement;
}

describe('StepStackStep', () => {
  it('keeps the panel chrome in the standard stacked layout', () => {
    render(<StepStackExample />);

    expect(getStepPanel('Second step')).toHaveClass(
      'rounded-lg',
      'border',
      'p-6',
      'shadow-lg',
    );
  });

  it('removes the panel chrome from every embedded step', () => {
    render(<StepStackExample embedded />);

    expect(getStepPanel('First step')).not.toHaveClass(
      'rounded-lg',
      'border',
      'p-6',
      'shadow-lg',
    );
    expect(getStepPanel('Second step')).not.toHaveClass(
      'rounded-lg',
      'border',
      'p-6',
      'shadow-lg',
    );
  });
});
