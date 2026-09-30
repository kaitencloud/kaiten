import { createContext, type ReactNode, use } from 'react';
import type { StepStackContextValue } from '../types/step-stack.types';

const StepStackContext = createContext<StepStackContextValue | null>(null);

export function StepStackContextProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: StepStackContextValue;
}) {
  return (
    <StepStackContext.Provider value={value}>
      {children}
    </StepStackContext.Provider>
  );
}

export function useStepStackContext() {
  const context = use(StepStackContext);

  if (!context) {
    throw new Error('StepStack components must be used within a StepStack');
  }

  return context;
}
