import { DateTimePicker } from '@/components/date-time-picker';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';

type DateTimeFieldProps = {
  className?: string;
  label: string;
  required?: boolean;
  description?: string;
  disabled?: boolean;
};

/**
 * A date and a time, picked on a calendar with the time typed beside it. The
 * value is the text a `datetime-local` input holds, `2027-03-03T10:00`, with no
 * zone and no seconds, and empty when nothing is chosen: which zone it is in is
 * the screen's to say, in the label or the description. A field that reads it as
 * UTC converts it with the helper of the form that owns it, as the one for an
 * amount does.
 */
const DateTimeField = ({
  className,
  label,
  required,
  description,
  disabled,
}: DateTimeFieldProps) => {
  return (
    <FormField<string>
      className={className}
      label={label}
      required={required}
      description={description}
      disabled={disabled}
    >
      {(field) => (
        <FormControl announceRequired={false}>
          <DateTimePicker
            value={field.value ?? ''}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            disabled={disabled}
            aria-invalid={field.hasError}
          />
        </FormControl>
      )}
    </FormField>
  );
};

export default DateTimeField;
