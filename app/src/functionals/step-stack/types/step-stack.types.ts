import type {
  ButtonHTMLAttributes,
  Dispatch,
  HTMLAttributes,
  ReactElement,
  SetStateAction,
} from 'react';

export type StepStackChildProps = {
  index?: number;
};

export type StepStackOrientation =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type StepStackContextValue = {
  activeIndex: number;
  activeStepHeight: number;
  clickable: boolean;
  embedded: boolean;
  offset: number;
  orientation: StepStackOrientation;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  setActiveStepHeight: Dispatch<SetStateAction<number>>;
  setTotalSteps: Dispatch<SetStateAction<number>>;
  totalSteps: number;
  widthOffset: number;
};

export type StepStackProps = HTMLAttributes<HTMLDivElement> & {
  clickable?: boolean;
  defaultIndex?: number;
  embedded?: boolean;
  orientation?: StepStackOrientation;
  offset?: number;
  widthOffset?: number;
};

export type StepStackContainerProps = HTMLAttributes<HTMLDivElement> & {
  children:
    | ReactElement<StepStackChildProps>
    | ReactElement<StepStackChildProps>[];
};

export type StepStackStepProps = HTMLAttributes<HTMLDivElement> & {
  index?: number;
  offset?: number;
};

export type StepStackNextProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
};

export type StepStackPreviousProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
};
