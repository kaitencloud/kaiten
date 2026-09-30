'use client';

import type { KeyboardEvent } from 'react';
import { createContext, use, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import type {
  StepStackOrientation,
  StepStackStepProps,
} from '../types/step-stack.types';
import { useStepStackContext } from './step-stack-context';

type StepStackStepStateValue = {
  isActive: boolean;
};

const StepStackStepStateContext = createContext<StepStackStepStateValue>({
  isActive: true,
});

/**
 * State of the closest StepStackStep. Components rendered inside an embedded
 * step (which own their card chrome) use it to fade their content while
 * keeping the card shell visible in the stack peek. Outside a step it reports
 * `isActive: true`.
 */
export function useStepStackStepState() {
  return use(StepStackStepStateContext);
}

const DIRECTION_VECTOR_BY_ORIENTATION: Record<
  StepStackOrientation,
  { x: number; y: number }
> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  'top-left': { x: -1, y: -1 },
  'top-right': { x: 1, y: -1 },
  'bottom-left': { x: -1, y: 1 },
  'bottom-right': { x: 1, y: 1 },
};

export function StepStackStep({
  children,
  className,
  index = 0,
  offset,
  ...props
}: StepStackStepProps) {
  const context = useStepStackContext();
  const stepRef = useRef<HTMLDivElement>(null);
  const stackDepth = context.activeIndex - index;
  const directionVector = DIRECTION_VECTOR_BY_ORIENTATION[context.orientation];
  const stepOffset = offset ?? context.offset;
  const translateX = stackDepth * stepOffset * directionVector.x;
  const translateY = stackDepth * stepOffset * directionVector.y;
  const widthReductionFactor = directionVector.x === 0 ? 1 : 0;
  const widthReduction =
    Math.max(0, stackDepth) * context.widthOffset * widthReductionFactor;
  const isActive = stackDepth === 0;
  const isFutureStep = stackDepth < 0;
  const isClickablePastStep = context.clickable && context.activeIndex > index;
  const constrainedHeight =
    !isActive && !isFutureStep && context.activeStepHeight > 0
      ? context.activeStepHeight
      : undefined;

  const handleClick = () => {
    if (!isClickablePastStep) {
      return;
    }

    context.setActiveIndex(index);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isClickablePastStep) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  useEffect(() => {
    if (!isActive || !stepRef.current) {
      return;
    }

    const element = stepRef.current;
    const updateHeight = () => {
      context.setActiveStepHeight(element.getBoundingClientRect().height);
    };

    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [context, isActive]);

  // Inactive steps must never intercept clicks meant for the active step.
  // Without `pointer-events: none`, a stacked past step positioned on top of
  // the active step's CTA can fail Playwright's actionability check (and,
  // in real usage, swallow stray clicks at the edges of the active panel).
  // Past steps re-enable pointer events only when they're navigable.
  const pointerEvents = isActive
    ? 'auto'
    : isClickablePastStep
      ? 'auto'
      : 'none';

  const usesPanelChrome = !context.embedded;
  const stepState = useMemo<StepStackStepStateValue>(
    () => ({ isActive }),
    [isActive],
  );

  // A past step is a real button (role + focus + keyboard) only when it's
  // navigable. Otherwise it's a plain panel with no interaction handlers at
  // all — keeping the handlers and the role together avoids a static element
  // that carries an onClick without an interactive role.
  const interactiveProps = isClickablePastStep
    ? {
        onClick: handleClick,
        onKeyDown: handleKeyDown,
        role: 'button' as const,
        tabIndex: 0,
      }
    : undefined;

  return (
    <div
      ref={stepRef}
      className={cn(
        'h-auto w-full transition-[transform,opacity] duration-300',
        usesPanelChrome && 'rounded-lg border bg-background p-6 shadow-lg',
      )}
      {...interactiveProps}
      style={{
        top: 0,
        left: 0,
        transform: `translate(${translateX}px, ${translateY}px)`,
        width: `calc(100% - ${widthReduction}px)`,
        zIndex: 50 - Math.max(0, stackDepth),
        position: isActive ? 'relative' : 'absolute',
        display: isFutureStep ? 'none' : undefined,
        height: constrainedHeight,
        overflow: !isActive && !isFutureStep ? 'hidden' : undefined,
        opacity: isActive ? 1 : 0.95,
        cursor: isClickablePastStep ? 'pointer' : 'default',
        pointerEvents,
      }}
      {...props}
    >
      <div
        className={cn(
          'h-full w-full transition-opacity duration-300',
          !isActive && 'pointer-events-none select-none',
          // Embedded steps own their card chrome: fading everything would hide
          // the whole card in the stack peek, so the card fades its own content
          // via useStepStackStepState instead.
          !isActive && usesPanelChrome && 'opacity-0',
          className,
        )}
      >
        <StepStackStepStateContext.Provider value={stepState}>
          {children}
        </StepStackStepStateContext.Provider>
      </div>
    </div>
  );
}
