import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DatePickerShell,
  UtcDayCalendar,
  type DatePickerTriggerProps,
} from '@/components/date-picker-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  dateTimeInputToInstant,
  isTimeOfDay,
  joinDateTimeInput,
  splitDateTimeInput,
} from '@/lib/date-time-input';
import { formatDateTime } from '@/lib/format-date';

const MIDNIGHT = '00:00';

type DateTimePickerProps = DatePickerTriggerProps & {
  /** The moment, `2027-03-03T10:00` (UTC, no seconds), or an empty text for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * A UTC date and time: a day picked on a calendar and a time typed beside it.
 * It holds the text a `datetime-local` input held, `2027-03-03T10:00`, with no
 * zone and no seconds, and an empty text while no day is chosen, so a form that
 * read that text reads this the same. A text that is not a date and a time shows
 * as none and stays as it is until the person picks one.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder,
  ...props
}: DateTimePickerProps) {
  const { t } = useTranslation();
  const parts = splitDateTimeInput(value);
  const instant = parts ? dateTimeInputToInstant(value) : null;
  // The time typed before any day is chosen: the day picked next takes it.
  const [pendingTime, setPendingTime] = useState('');

  const pickDay = (day: string) => {
    const time =
      parts?.time ?? (isTimeOfDay(pendingTime) ? pendingTime : MIDNIGHT);

    onChange(joinDateTimeInput(day, time));
    setPendingTime('');
  };

  return (
    <DatePickerShell
      {...props}
      dialogLabel={t('Common.datePicker.dateTimeDialog')}
      onClear={() => onChange('')}
      placeholder={placeholder ?? t('Common.pickDateTime')}
      text={
        instant
          ? formatDateTime(instant, {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'UTC',
            })
          : undefined
      }
      value={parts ? joinDateTimeInput(parts.day, parts.time) : ''}
    >
      {({ close }) => (
        <>
          <UtcDayCalendar day={parts?.day ?? ''} onDayChange={pickDay} />
          <TimeOfDayInput
            onDone={close}
            onTimeChange={(time) =>
              parts
                ? onChange(joinDateTimeInput(parts.day, time))
                : setPendingTime(time)
            }
            time={parts?.time ?? pendingTime}
          />
        </>
      )}
    </DatePickerShell>
  );
}

type TimeOfDayInputProps = {
  time: string;
  /** Called with a time of day, `HH:mm`, each time the text typed becomes one. */
  onTimeChange: (time: string) => void;
  /** Called when the person presses Enter: they are done with the time. */
  onDone: () => void;
};

// What is typed stays here until it is a time of day: half a time ("10:0") is
// no value, and the field must not take it for the one the person had.
function TimeOfDayInput({ time, onTimeChange, onDone }: TimeOfDayInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? time;
  const invalid = shown !== '' && !isTimeOfDay(shown);

  return (
    <div className="space-y-1.5 border-t p-3 pt-2">
      <Label htmlFor={id}>{t('Common.datePicker.timeUtc')}</Label>
      <Input
        aria-describedby={invalid ? errorId : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        id={id}
        inputMode="numeric"
        maxLength={5}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          const next = event.target.value;

          setDraft(next);
          if (isTimeOfDay(next)) {
            onTimeChange(next);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (!invalid) {
              onDone();
            }
          }
        }}
        placeholder={MIDNIGHT}
        value={shown}
      />
      {invalid ? (
        <p className="text-xs text-destructive-subtle-foreground" id={errorId}>
          {t('Common.datePicker.timeInvalid')}
        </p>
      ) : null}
    </div>
  );
}
