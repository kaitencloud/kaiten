import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { Input } from '@/components/ui/input';

type DateTimeFieldProps = {
  className?: string;
  label: string;
  required?: boolean;
  description?: string;
  disabled?: boolean;
};

/**
 * A date and a time, typed or picked with the browser's own control. The value is
 * the text the control holds, `2027-03-03T10:00`, with no zone and no seconds, and
 * empty when nothing is chosen: which zone it is in is the screen's to say, in the
 * label or the description. A field that reads it as UTC converts it with the
 * helper of the form that owns it, as the one for an amount does.
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
        <FormControl>
          <Input
            type="datetime-local"
            value={field.value ?? ''}
            onChange={(event) => field.handleChange(event.target.value)}
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
