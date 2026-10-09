import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

type ChoiceButtonProps = {
  /** What the option means, under its label. */
  detail?: ReactNode;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
  selected: boolean;
  /** A word on the right of the option, such as the unit a meter is sold in. */
  trailing?: ReactNode;
};

/**
 * One choice among a few a form offers, as a button that is pressed when chosen: the
 * shape of a price, how it is billed, what it meters, the type of a voucher. A choice
 * that cannot be made stays visible and says why, rather than vanishing.
 *
 * The reason is what a person reads the option for, so a choice that cannot be
 * made is disabled for what it does and not for what it says: it is not
 * disabled to the browser, which would take it out of the tab order and leave
 * its explanation to those who browse. Only its label is dimmed, since the
 * explanation under it has to stay readable, and a screen reader names the
 * option by its label and describes it with the rest.
 */
export function ChoiceButton({
  detail,
  disabled,
  label,
  onSelect,
  selected,
  trailing,
}: ChoiceButtonProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const detailId = `${id}-detail`;
  const trailingId = `${id}-trailing`;
  const describedBy = [detail ? detailId : null, trailing ? trailingId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      aria-describedby={describedBy || undefined}
      aria-disabled={disabled || undefined}
      aria-labelledby={labelId}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary bg-primary/10' : 'hover:bg-muted/50',
        disabled && 'cursor-not-allowed hover:bg-transparent',
      )}
      onClick={disabled ? undefined : onSelect}
      type="button"
    >
      <span className="min-w-0">
        <span
          className={cn('block font-medium', disabled && 'opacity-60')}
          id={labelId}
        >
          {label}
        </span>
        {detail ? (
          <span className="block text-xs text-muted-foreground" id={detailId}>
            {detail}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0" id={trailingId}>
          {trailing}
        </span>
      ) : null}
    </button>
  );
}
