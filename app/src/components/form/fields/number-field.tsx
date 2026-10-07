import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { NumberInput } from '@/components/ui/number-input';

type NumberFieldProps = {
  /**
   * Keep a number typed outside `min` and `max` and let the schema refuse it with
   * its own words, instead of changing it to the nearest bound behind the person's
   * back. The steppers still stop at the bounds.
   */
  allowOutOfRange?: boolean;
  className?: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number | 'any';
  onChange?: (value: number) => void;
};

const NumberField = ({
  allowOutOfRange,
  className,
  label,
  required,
  placeholder,
  description,
  disabled,
  min,
  max,
  step,
  onChange,
}: NumberFieldProps) => {
  return (
    <FormField<number>
      className={className}
      label={label}
      required={required}
      description={description}
      disabled={disabled}
    >
      {(field) => (
        <FormControl>
          <NumberInput
            allowOutOfRange={allowOutOfRange}
            value={Number.isFinite(field.value) ? field.value : null}
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
            onValueChange={(value) => {
              const nextValue = value ?? Number.NaN;
              field.handleChange(nextValue);
              onChange?.(nextValue);
            }}
            onBlur={field.handleBlur}
            disabled={disabled}
          />
        </FormControl>
      )}
    </FormField>
  );
};

export default NumberField;
