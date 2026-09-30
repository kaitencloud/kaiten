import { DatePicker, type DatePickerProps } from '@/components/date-picker';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';

type DatePickerFieldProps = {
  className?: string;
  label: string;
  description?: string;
  required?: boolean;
  /**
   * If true, the field will work with ISO string values instead of Date objects
   * Default: false (works with Date objects)
   */
  useISOString?: boolean;
} & Omit<DatePickerProps, 'date' | 'onSelect'>;

const DatePickerField = ({
  className,
  label,
  description,
  required,
  useISOString = false,
  ...props
}: DatePickerFieldProps) => {
  if (useISOString) {
    return (
      <FormField<string | undefined>
        className={className}
        label={label}
        description={description}
        required={required}
      >
        {(field) => (
          <FormControl>
            <DatePicker
              date={field.value ? new Date(field.value) : undefined}
              onSelect={(date) => field.handleChange(date?.toISOString() ?? '')}
              {...props}
            />
          </FormControl>
        )}
      </FormField>
    );
  }

  return (
    <FormField<Date | undefined>
      className={className}
      label={label}
      description={description}
      required={required}
    >
      {(field) => (
        <FormControl>
          <DatePicker
            date={field.value}
            onSelect={field.handleChange}
            {...props}
          />
        </FormControl>
      )}
    </FormField>
  );
};

export default DatePickerField;
