'use client';

import { Children, cloneElement, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { StepStackContainerProps } from '../types/step-stack.types';
import { useStepStackContext } from './step-stack-context';

export function StepStackContainer({
  children,
  className,
  ...props
}: StepStackContainerProps) {
  const { setTotalSteps } = useStepStackContext();
  const totalSteps = Children.count(children);

  useEffect(() => {
    setTotalSteps(totalSteps);
  }, [setTotalSteps, totalSteps]);

  return (
    <div
      className={cn(
        'relative flex w-full flex-col items-center justify-center',
        className,
      )}
      {...props}
    >
      {Children.map(children, (child, index) => cloneElement(child, { index }))}
    </div>
  );
}
