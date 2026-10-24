import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type ChecklistOption = {
  id: string;
  label: string;
  /** A word under the label, such as the amount of a price or why it is dimmed. */
  detail?: string;
  muted?: boolean;
};

type ReferenceChecklistProps = {
  className?: string;
  /** The name of the list, for who reads it by its name. */
  label: string;
  onChange: (ids: string[]) => void;
  options: readonly ChecklistOption[];
  /** The ids checked. One that is no longer offered stays checked, and listed. */
  value: readonly string[];
};

function Row({
  checked,
  onToggle,
  option,
}: {
  checked: boolean;
  onToggle: () => void;
  option: ChecklistOption;
}) {
  const id = useId();

  return (
    <li className="flex items-start gap-3 py-1.5">
      <Checkbox
        checked={checked}
        className="mt-0.5"
        id={id}
        onCheckedChange={onToggle}
      />
      <Label
        className={cn(
          'block cursor-pointer',
          option.muted && 'text-muted-foreground',
        )}
        htmlFor={id}
      >
        <span className="block text-sm">{option.label}</span>
        {option.detail ? (
          <span className="block text-xs font-normal text-muted-foreground">
            {option.detail}
          </span>
        ) : null}
      </Label>
    </li>
  );
}

/**
 * A short list of what a voucher can be limited to -- license versions, add-on versions,
 * prices -- with a box for each. Nothing checked is no limit. It names what is checked
 * even when the offer no longer has it (a version that was deleted), so that a limit the
 * person cannot see is never kept.
 */
export function ReferenceChecklist({
  className,
  label,
  onChange,
  options,
  value,
}: ReferenceChecklistProps) {
  const offered = new Set(options.map(({ id }) => id));
  const checked = new Set(value);
  const rows: ChecklistOption[] = [
    ...options,
    ...value
      .filter((id) => !offered.has(id))
      .map((id) => ({ id, label: id, muted: true })),
  ];

  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((held) => held !== id) : [...value, id],
    );
  }

  return (
    <ul
      aria-label={label}
      className={cn(
        'max-h-60 divide-y overflow-y-auto rounded-md border px-3',
        className,
      )}
    >
      {rows.map((option) => (
        <Row
          checked={checked.has(option.id)}
          key={option.id}
          onToggle={() => toggle(option.id)}
          option={option}
        />
      ))}
    </ul>
  );
}
