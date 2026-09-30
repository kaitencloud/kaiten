'use client';

import { useState } from 'react';
import type { StepStackProps } from '../types/step-stack.types';
import { StepStackContextProvider } from './step-stack-context';

export function StepStack({
  children,
  className,
  clickable = false,
  defaultIndex = 0,
  embedded = false,
  orientation = 'top',
  offset = 10,
  widthOffset = 10,
  ...props
}: StepStackProps) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const [activeStepHeight, setActiveStepHeight] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

  return (
    <StepStackContextProvider
      value={{
        activeIndex,
        activeStepHeight,
        clickable,
        embedded,
        offset,
        orientation,
        setActiveIndex,
        setActiveStepHeight,
        setTotalSteps,
        totalSteps,
        widthOffset,
      }}
    >
      <div className={className} {...props}>
        {children}
      </div>
    </StepStackContextProvider>
  );
}
