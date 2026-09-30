'use client';

import type { MouseEvent, MouseEventHandler, ReactElement } from 'react';
import { cloneElement } from 'react';
import { cn } from '@/lib/utils';
import type {
  StepStackNextProps,
  StepStackPreviousProps,
} from '../types/step-stack.types';
import { useStepStackContext } from './step-stack-context';

const CONTROL_CLASS_NAME =
  'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

type ControlChild = ReactElement<{
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}>;

function renderControl(
  asChild: boolean | undefined,
  children: ReactElement | string | undefined,
  className: string | undefined,
  disabled: boolean,
  handleClick: () => void,
  label: string,
  props: Omit<StepStackNextProps, 'asChild'>,
) {
  if (asChild && children) {
    const child = children as ControlChild;

    return cloneElement(child, {
      ...props,
      className: cn(className, child.props.className),
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        handleClick();
        child.props.onClick?.(event);
      },
    });
  }

  return (
    <button
      type="button"
      className={cn(CONTROL_CLASS_NAME, className)}
      disabled={disabled}
      onClick={handleClick}
      {...props}
    >
      {children || label}
    </button>
  );
}

export function StepStackNext({
  children,
  className,
  asChild,
  ...props
}: StepStackNextProps) {
  const context = useStepStackContext();
  const disabled = context.activeIndex >= context.totalSteps - 1;

  const handleNext = () => {
    if (!disabled) {
      context.setActiveIndex(context.activeIndex + 1);
    }
  };

  return renderControl(
    asChild,
    children as ReactElement | string | undefined,
    className,
    disabled,
    handleNext,
    'Next',
    props,
  );
}

export function StepStackPrevious({
  children,
  className,
  asChild,
  ...props
}: StepStackPreviousProps) {
  const context = useStepStackContext();
  const disabled = context.activeIndex <= 0;

  const handlePrevious = () => {
    if (!disabled) {
      context.setActiveIndex(context.activeIndex - 1);
    }
  };

  return renderControl(
    asChild,
    children as ReactElement | string | undefined,
    className,
    disabled,
    handlePrevious,
    'Previous',
    props,
  );
}

export function useStepStack() {
  const context = useStepStackContext();

  return {
    activeIndex: context.activeIndex,
    totalSteps: context.totalSteps,
    goToStep: context.setActiveIndex,
    nextStep: () => {
      if (context.activeIndex < context.totalSteps - 1) {
        context.setActiveIndex(context.activeIndex + 1);
      }
    },
    previousStep: () => {
      if (context.activeIndex > 0) {
        context.setActiveIndex(context.activeIndex - 1);
      }
    },
    isFirstStep: context.activeIndex === 0,
    isLastStep: context.activeIndex === context.totalSteps - 1,
  };
}
