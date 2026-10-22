import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DatePickerShell,
  UtcDayCalendar,
  type DatePickerTriggerProps,
} from '@/components/date-picker-shell';
import { TimeField } from '@/components/time-field';
import { useFocusLeave } from '@/hooks/use-focus-leave';
import { getAppLocale } from '@/lib/app-locale';
import { dateInputToInstant } from '@/lib/date-input';
import {
  dateTimeInputToInstant,
  isTimeOfDay,
  joinDateTimeInput,
  leadingDayOfDateTimeInput,
  parseTimeOfDay,
  splitDateTimeInput,
  timeOfTimeOnlyInput,
} from '@/lib/date-time-input';
import { formatDate } from '@/lib/format-date';
import {
  browserTimeZone,
  isUtcZone,
  localTimeHint,
} from '@/lib/local-time-hint';
import {
  isFilledTime,
  isOutOfRange,
  splitTimeText,
} from '@/lib/time-field-model';
import { cn } from '@/lib/utils';

const MIDNIGHT = '00:00';

type DateTimePickerProps = DatePickerTriggerProps & {
  /** The moment, `2027-03-03T10:00` (UTC, no seconds), or an empty text for none. */
  value: string;
  onChange: (value: string) => void;
  /** The text of the date button while no day is chosen. */
  placeholder?: string;
  /**
   * The id of the element that names the pair (the label of the form field):
   * the date button and the time field sit in a group it labels. Without it the
   * pair is no group, and the button is named as any button is.
   */
  groupLabelledBy?: string;
  /**
   * The zone the local equivalent of the moment is shown in. It is the zone of
   * the clock of the browser unless a story or a test sets one; nothing is
   * shown in UTC.
   */
  localTimeZone?: string;
};

/**
 * A UTC date and time: a button that opens a calendar, and a time field beside
 * it (`TimeField`). It holds the text a `datetime-local` input held,
 * `2027-03-03T10:00`, with no zone and no seconds, and an empty text while
 * nothing is chosen, so a form that read that text reads this the same. The calendar
 * closes with the day picked; the time is set in the field, with the keyboard or
 * from the columns of its clock.
 *
 * The time is on the 24-hour clock. A time is only taken once both of its
 * segments are filled: while one is empty the value is left as it was, and when
 * the field is left the form is given the half-filled time with the day
 * (`2027-03-03T10:--`), which its own validation refuses; the field shows it,
 * marked invalid, and nothing replaces it behind the person's back. A
 * time typed to the end that is none (`24:00`) is given to the form at once, as
 * typed, and said to be wrong. A time typed with no day is
 * given to the form as it is, with no day (`T09:30`), which a form refuses
 * rather than reading an empty value, so a time is never dropped without a
 * word: the person chooses a day, or empties the time. The same
 * goes for a text a form hands in that is not a moment: it shows as it is and
 * stays until the person picks one.
 *
 * The moment is UTC and the person's clock is not: under the pair the picker
 * says what it is on the clock of the browser (`= 18:21 in Paris (CEST)`), and
 * only when that clock is not UTC. It is words about the value, never part of it.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder,
  groupLabelledBy,
  localTimeZone,
  className,
  onBlur,
  disabled,
  ...props
}: DateTimePickerProps) {
  const { t } = useTranslation();
  const localId = useId();
  const errorId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const parts = splitDateTimeInput(value);
  const day = parts?.day ?? leadingDayOfDateTimeInput(value);
  const held = value.trim();
  // The time of a pair with no day (`T09:30`), which the form refuses.
  const timeOnly = day ? '' : timeOfTimeOnlyInput(held);
  // What is in the time field and is not (yet) the time the value holds: a time
  // half filled, or one the form refuses. It belongs to the value it was typed
  // against: the form changing the value from elsewhere (a reset) drops it. With
  // no day chosen it is the time the day picked next takes, as it is, and the
  // form is given it with no day (`T09:30`) to refuse until a day is picked.
  const [typed, setTyped] = useState<{ text: string; value: string } | null>(
    null,
  );
  const draft = typed && typed.value === value ? typed.text : null;
  // A value the form refuses keeps its time: it is shown, not hidden.
  const time =
    draft ?? parts?.time ?? (day ? held.slice(day.length + 1) : timeOnly);
  const normalTime = parseTimeOfDay(time);
  // The value holds a time that is none, which a time half filled does not
  // until the field is left.
  const timeProblem = !parts && day !== '' && time !== '' && !normalTime;
  // The form shows its own message for a time it refuses (it is on the
  // description of both controls): the picker says it itself only without one.
  const formInvalid =
    props['aria-invalid'] === true || props['aria-invalid'] === 'true';
  // A time and no day: said too, as the form says its own once the field is
  // touched.
  const dayMissing = timeOnly !== '';
  const ownError = (timeProblem || dayMissing) && !formInvalid;
  // A time that is right and has no day: the day is what is wrong, so the date
  // button says so and the time field does not, whatever the form flags.
  const dayOnlyMissing = dayMissing && normalTime !== null;
  // A time with a segment out of range (`24:00`), as against one half filled.
  const timeImpossible =
    isOutOfRange(splitTimeText(time), 'hours') ||
    isOutOfRange(splitTimeText(time), 'minutes');
  const zone = localTimeZone ?? browserTimeZone();
  const showsLocalTime = zone !== null && !isUtcZone(zone);
  const localHint =
    showsLocalTime && day && normalTime
      ? describeLocalTime(
          t,
          dateTimeInputToInstant(joinDateTimeInput(day, normalTime)),
          zone,
        )
      : undefined;

  const leave = useFocusLeave({
    containers: () => [
      rootRef.current,
      calendarRef.current,
      columnsRef.current,
    ],
    onLeave: () => onBlur?.(),
  });

  const write = (next: string, text: string | null) => {
    if (next !== value) {
      onChange(next);
    }
    setTyped(text === null ? null : { text, value: next });
  };

  const pickDay = (picked: string) => {
    write(
      joinDateTimeInput(picked, draft || parts?.time || timeOnly || MIDNIGHT),
      draft || null,
    );
  };

  // A time typed to the end is given to the form at once, whether it is a time
  // or not (`24:00`), so that the form never holds the time it had while the
  // field shows another. One half filled waits for the field to be left.
  const changeTime = (text: string) => {
    write(
      isTimeOfDay(text) || isFilledTime(text)
        ? joinDateTimeInput(day, text)
        : value,
      text,
    );
  };

  // Called as the time field is left, or Enter is pressed in it. A time that is
  // no time is written to the value as it is, for the form to refuse, and stays
  // in the field; one that was only emptied goes back to the time the value
  // holds, or to nothing when it holds a time and no day.
  const settleTime = () => {
    if (draft === null) {
      return;
    }
    if (draft === '') {
      write(timeOnly ? '' : value, null);

      return;
    }
    if (normalTime) {
      write(joinDateTimeInput(day, normalTime), day ? null : normalTime);

      return;
    }
    write(joinDateTimeInput(day, draft), draft);
  };

  return (
    <div
      aria-labelledby={groupLabelledBy}
      className={cn('space-y-1.5', className)}
      data-slot="date-time-picker"
      onBlur={leave.onBlur}
      onFocus={leave.onFocus}
      ref={rootRef}
      role={groupLabelledBy ? 'group' : undefined}
    >
      <div className="flex flex-wrap gap-2">
        <DatePickerShell
          {...props}
          aria-invalid={
            props['aria-invalid'] || (held !== '' && !day) || undefined
          }
          className="min-w-36 flex-1 basis-36 w-auto"
          dialogLabel={t('Common.datePicker.dateDialog')}
          disabled={disabled}
          onBlur={leave.check}
          onClear={() => {
            setTyped(null);
            onChange('');
          }}
          placeholder={placeholder ?? t('Common.pickDate')}
          popupRef={calendarRef}
          text={dayText(day) ?? ((timeOnly ? '' : held) || undefined)}
          value={parts ? joinDateTimeInput(parts.day, parts.time) : held}
        >
          {({ close }) => (
            <UtcDayCalendar
              day={day}
              onDayChange={(picked) => {
                pickDay(picked);
                close();
              }}
            />
          )}
        </DatePickerShell>
        <TimeField
          aria-describedby={
            [
              props['aria-describedby'],
              showsLocalTime ? localId : undefined,
              ownError ? errorId : undefined,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          aria-invalid={
            (formInvalid && !dayOnlyMissing) || timeProblem || undefined
          }
          aria-label={
            localHint
              ? t('Common.datePicker.timeUtcWithLocal')
              : t('Common.datePicker.timeUtc')
          }
          disabled={disabled}
          onChange={changeTime}
          onSettle={settleTime}
          popupRef={columnsRef}
          value={time}
        />
      </div>
      {showsLocalTime ? (
        // There while the zone is not UTC, empty or not, so the form keeps its
        // height as the time is typed.
        <p
          aria-live="polite"
          className="text-muted-foreground min-h-4 text-[0.8rem]"
          data-slot="date-picker-local-time"
          id={localId}
        >
          {localHint}
        </p>
      ) : null}
      {ownError ? (
        <p className="text-xs text-destructive-subtle-foreground" id={errorId}>
          {t(
            dayMissing
              ? 'Common.datePicker.dayMissing'
              : timeImpossible
                ? 'Common.datePicker.timeOutOfRange'
                : 'Common.datePicker.timeInvalid',
          )}
        </p>
      ) : null}
    </div>
  );
}

// `Mar 3, 2027`, in the language of the app: the day on the button.
function dayText(day: string): string | undefined {
  return day
    ? formatDate(dateInputToInstant(day), {
        dateStyle: 'medium',
        timeZone: 'UTC',
      })
    : undefined;
}

type Translate = ReturnType<typeof useTranslation>['t'];

// `= 18:21 in Paris (CEST)`: the moment on the clock of the zone, in the
// language of the app.
function describeLocalTime(
  t: Translate,
  instant: string | null,
  timeZone: string | null,
): string | undefined {
  const hint = localTimeHint(instant, { locale: getAppLocale(), timeZone });
  if (!hint) {
    return undefined;
  }

  return hint.place
    ? t('Common.datePicker.localEquivalent', hint)
    : t('Common.datePicker.localEquivalentNoPlace', hint);
}
