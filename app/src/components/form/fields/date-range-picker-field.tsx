import type { DateRange } from 'react-day-picker';
import {
  DateRangePicker,
  type DateRangePickerProps,
} from '@/components/date-range-picker';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';

type DateRangePickerFieldProps = {
  className?: string;
  label: string;
  required?: boolean;
  description?: string;
} & Omit<DateRangePickerProps, 'date' | 'onSelect'>;

const DateRangePickerField = ({
  className,
  label,
  required,
  description,
  ...props
}: DateRangePickerFieldProps) => {
  return (
    <FormField<DateRange | undefined>
      className={className}
      label={label}
      required={required}
      description={description}
    >
      {(field) => (
        <FormControl>
          <DateRangePicker
            date={field.value}
            onSelect={field.handleChange}
            {...props}
          />
        </FormControl>
      )}
    </FormField>
  );
};

export default DateRangePickerField;
