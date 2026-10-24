import { DateTimePicker } from '@/components/date-time-picker';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { useFormFieldContext } from '@/components/form/form-context';

type DateTimeFieldProps = {
  className?: string;
  label: string;
  required?: boolean;
  description?: string;
  disabled?: boolean;
};

/**
 * A date and a time, the day picked on a calendar and the time set in a field
 * beside it. The value is the text a `datetime-local` input holds,
 * `2027-03-03T10:00`, with no zone and no seconds, and empty when nothing is
 * chosen: which zone it is in is the screen's to say, in the label or the
 * description. A field that reads it as UTC converts it with the helper of the
 * form that owns it, as the one for an amount does.
 *
 * The label names the pair as a group, and the date button too (the label
 * points at it), so a test finds the button by its role and name, not by its
 * label alone.
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
        <DateTimeControl
          disabled={disabled}
          hasError={field.hasError}
          labelled={Boolean(label)}
          onBlur={field.handleBlur}
          onChange={field.handleChange}
          value={field.value ?? ''}
        />
      )}
    </FormField>
  );
};

type DateTimeControlProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  hasError: boolean;
  labelled: boolean;
  disabled?: boolean;
};

// Reads the form item the field sits in, which its own component is above.
function DateTimeControl({
  value,
  onChange,
  onBlur,
  hasError,
  labelled,
  disabled,
}: DateTimeControlProps) {
  const { formLabelId } = useFormFieldContext();

  return (
    <FormControl announceRequired={false}>
      <DateTimePicker
        aria-invalid={hasError}
        disabled={disabled}
        groupLabelledBy={labelled ? formLabelId : undefined}
        onBlur={onBlur}
        onChange={onChange}
        value={value}
      />
    </FormControl>
  );
}

export default DateTimeField;
