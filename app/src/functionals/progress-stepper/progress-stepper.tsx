import { cn } from '@/lib/utils';

export type ProgressStepperStep = {
  id: string;
  label: string;
};

type ProgressStepperProps = {
  activeStep: number;
  furthestStep: number;
  onStepChange: (index: number) => void;
  steps: readonly ProgressStepperStep[];
};

/**
 * The numbered strip and progress bar above a full-page create wizard (feature
 * flags, releases, entitlements). A step beyond the furthest one reached stays
 * disabled, so the strip only ever jumps back.
 */
export function ProgressStepper({
  activeStep,
  furthestStep,
  onStepChange,
  steps,
}: ProgressStepperProps) {
  const progress = ((activeStep + 1) / steps.length) * 100;
  const renderStep = (step: ProgressStepperStep, index: number) => (
    <ProgressStep
      activeStep={activeStep}
      disabled={index > furthestStep}
      index={index}
      key={step.id}
      label={step.label}
      onStepChange={onStepChange}
    />
  );

  return (
    <div className="shrink-0">
      <div
        className="mb-3 grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        }}
      >
        {steps.map(renderStep)}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function ProgressStep({
  activeStep,
  disabled,
  index,
  label,
  onStepChange,
}: {
  activeStep: number;
  disabled: boolean;
  index: number;
  label: string;
  onStepChange: (index: number) => void;
}) {
  return (
    <button
      className={cn(
        'text-left text-xs font-medium text-muted-foreground transition-colors',
        index === activeStep && 'text-foreground',
        index < activeStep && 'text-primary-subtle-foreground',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:text-foreground',
      )}
      disabled={disabled}
      onClick={() => onStepChange(index)}
      type="button"
    >
      <span className="block text-[10px] font-semibold tracking-wide uppercase">
        0{index + 1}
      </span>
      <span className="mt-0.5 block truncate">{label}</span>
    </button>
  );
}
