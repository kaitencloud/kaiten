import { NumberField } from '@base-ui/react/number-field';
import { Minus, Plus } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

type NumberInputProps = {
  className?: string;
  value?: number | null;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number | 'any';
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  id?: string;
  ref?: React.Ref<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onValueChange?: (value: number | null) => void;
  onValueCommitted?: (value: number | null) => void;
  'aria-describedby'?: string;
  'aria-invalid'?: React.AriaAttributes['aria-invalid'];
};

export function NumberInput({
  className,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  placeholder,
  disabled,
  readOnly,
  id,
  ref,
  onBlur,
  onValueChange,
  onValueCommitted,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: NumberInputProps) {
  return (
    <NumberField.Root
      className="w-full"
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      readOnly={readOnly}
      onValueChange={(nextValue) => onValueChange?.(nextValue)}
      onValueCommitted={(nextValue) => onValueCommitted?.(nextValue)}
    >
      <NumberField.Group
        aria-invalid={ariaInvalid}
        className={cn(
          'border-input dark:bg-input/30 bg-transparent shadow-xs data-[focused]:border-ring data-[focused]:ring-ring/50 data-[focused]:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex h-9 items-center rounded-md border px-1.5 transition-[color,box-shadow]',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <NumberField.Input
          ref={ref}
          id={id}
          className={cn(
            'placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent px-2 text-base tabular-nums outline-none md:text-sm',
            className,
          )}
          placeholder={placeholder}
          onBlur={onBlur}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
        />

        <div className="border-input ml-1 flex items-center border-l pl-1">
          <NumberField.Decrement
            type="button"
            className="hover:bg-muted/60 focus-visible:ring-ring inline-flex size-7 items-center justify-center rounded-sm transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
            aria-label="Decrease value"
          >
            <Minus className="size-4" />
          </NumberField.Decrement>

          <NumberField.Increment
            type="button"
            className="hover:bg-muted/60 focus-visible:ring-ring inline-flex size-7 items-center justify-center rounded-sm transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
            aria-label="Increase value"
          >
            <Plus className="size-4" />
          </NumberField.Increment>
        </div>
      </NumberField.Group>
    </NumberField.Root>
  );
}

NumberInput.displayName = 'NumberInput';
