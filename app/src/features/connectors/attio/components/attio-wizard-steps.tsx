import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Check, KeyRound, type LucideIcon, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStepStack } from '@/functionals/step-stack';

type WizardStep = {
  id: 1 | 2;
  labelKey: string;
  Icon: LucideIcon;
};

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: 1,
    labelKey: 'Pages.Integrations.Connectors.Wizard.Steps.connect',
    Icon: KeyRound,
  },
  {
    id: 2,
    labelKey: 'Pages.Integrations.Connectors.Wizard.Steps.schema',
    Icon: Sparkles,
  },
];

/** Reads the active step from the surrounding StepStack to render progress. */
export function WizardProgress() {
  const { activeIndex } = useStepStack();

  function renderStep(step: WizardStep, index: number) {
    return (
      <WizardStepDot
        key={step.id}
        step={step}
        done={index < activeIndex}
        active={index === activeIndex}
        isLast={index === WIZARD_STEPS.length - 1}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {WIZARD_STEPS.map(renderStep)}
    </div>
  );
}

function WizardStepDot({
  step,
  done,
  active,
  isLast,
}: {
  step: WizardStep;
  done: boolean;
  active: boolean;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const { Icon } = step;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div
        className={cn(
          'flex size-7 items-center justify-center rounded-full border text-xs font-medium',
          done &&
            'border-success-subtle-foreground/30 bg-success-subtle text-success-subtle-foreground',
          active &&
            'border-primary bg-primary-subtle text-primary-subtle-foreground',
          !done && !active && 'border-border text-muted-foreground',
        )}
      >
        {done ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Icon className="size-3.5" aria-hidden />
        )}
      </div>
      <span
        className={cn(
          'text-xs font-medium',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {t(step.labelKey)}
      </span>
      {!isLast && <Separator orientation="horizontal" className="!w-6" />}
    </div>
  );
}
