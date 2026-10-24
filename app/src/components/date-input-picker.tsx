import { useTranslation } from 'react-i18next';
import {
  DatePickerShell,
  UtcDayCalendar,
  type DatePickerTriggerProps,
} from '@/components/date-picker-shell';
import { dateInputToCalendarDate, dateInputToInstant } from '@/lib/date-input';
import { formatDate } from '@/lib/format-date';

type DateInputPickerProps = DatePickerTriggerProps & {
  /** The day, `2027-03-01` (a UTC day), or an empty text for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * A UTC day picked on a calendar. It holds the text a `type="date"` input held,
 * `2027-03-01`, and an empty text when no day is chosen, so a form or a filter
 * that read that text reads this the same. A text that is not a day shows as
 * none and stays as it is until the person picks one.
 */
export function DateInputPicker({
  value,
  onChange,
  placeholder,
  ...props
}: DateInputPickerProps) {
  const { t } = useTranslation();
  const day = dateInputToCalendarDate(value) ? value.trim() : '';

  return (
    <DatePickerShell
      {...props}
      dialogLabel={t('Common.datePicker.dateDialog')}
      onClear={() => onChange('')}
      placeholder={placeholder ?? t('Common.pickDate')}
      text={
        day
          ? formatDate(dateInputToInstant(day), {
              dateStyle: 'medium',
              timeZone: 'UTC',
            })
          : undefined
      }
      value={day}
    >
      {({ close }) => (
        <UtcDayCalendar
          day={day}
          onDayChange={(next) => {
            onChange(next);
            close();
          }}
        />
      )}
    </DatePickerShell>
  );
}
