import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getQuantitySteps } from '../../../../../utils/instance-addons.utils';

type QuantityStepperProps = {
  /** Disables both buttons: a change is being made, or the person may not make one. */
  disabled?: boolean;
  /** Names the quantity for the people who do not see the buttons' icons. */
  labels: { decrease: string; group: string; increase: string };
  /** The most the version allows, when it says. */
  max?: number;
  onChange: (quantity: number) => void;
  value: number;
};

/**
 * A quantity changed one unit at a time, from one to the most a version allows. The
 * buttons stop at the bounds and say they are disabled, and the value is announced
 * as it changes. It holds no state: the quantity is the one the caller shows, and a
 * change is the caller's to make or refuse.
 */
export function QuantityStepper({
  disabled = false,
  labels,
  max,
  onChange,
  value,
}: QuantityStepperProps) {
  const { canDecrease, canIncrease } = getQuantitySteps(value, {
    maxQuantity: max,
  });

  return (
    <div
      aria-label={labels.group}
      className="inline-flex items-center gap-1"
      role="group"
    >
      <Button
        aria-label={labels.decrease}
        disabled={disabled || !canDecrease}
        onClick={() => onChange(value - 1)}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <Minus />
      </Button>
      <span
        aria-live="polite"
        className="min-w-8 text-center text-sm font-medium tabular-nums"
        data-testid="quantity-value"
      >
        {value}
      </span>
      <Button
        aria-label={labels.increase}
        disabled={disabled || !canIncrease}
        onClick={() => onChange(value + 1)}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <Plus />
      </Button>
    </div>
  );
}
