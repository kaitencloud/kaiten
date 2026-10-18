import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DatePickerShell,
  UtcDayCalendar,
  type DatePickerTriggerProps,
} from '@/components/date-picker-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAppLocale } from '@/lib/app-locale';
import {
  dateTimeInputToInstant,
  isTimeOfDay,
  joinDateTimeInput,
  leadingDayOfDateTimeInput,
  parseTimeOfDay,
  splitDateTimeInput,
} from '@/lib/date-time-input';
import { formatDateTime } from '@/lib/format-date';
import {
  browserTimeZone,
  isUtcZone,
  localTimeHint,
} from '@/lib/local-time-hint';

const MIDNIGHT = '00:00';

type DateTimePickerProps = DatePickerTriggerProps & {
  /** The moment, `2027-03-03T10:00` (UTC, no seconds), or an empty text for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * The zone the local equivalent of the moment is shown in. It is the zone of
   * the clock of the browser unless a story or a test sets one; nothing is
   * shown in UTC.
   */
  localTimeZone?: string;
};

/**
 * A UTC date and time: a day picked on a calendar and a time typed beside it. It
 * holds the text a `datetime-local` input held, `2027-03-03T10:00`, with no zone
 * and no seconds, and an empty text while no day is chosen, so a form that read
 * that text reads this the same.
 *
 * The time is typed on the 24-hour clock the button shows: `9:15`, `930` and
 * `09:15` are one time, written back as `09:15`. A text that is no time is never
 * dropped: the form is given it with the day (`2027-03-03T25:99`), which its own
 * validation refuses, and the button shows it, marked invalid. The same goes for
 * a text a form hands in that is not a moment: it shows as it is, and stays until
 * the person picks one.
 *
 * The moment is UTC and the person's clock is not: next to it the picker says
 * what it is on the clock of the browser (`= 18:21 in Paris (CEST)`), under the
 * button and under the time field, and only when that clock is not UTC. It is
 * words about the value, never part of it.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder,
  localTimeZone,
  ...props
}: DateTimePickerProps) {
  const { t } = useTranslation();
  const parts = splitDateTimeInput(value);
  const instant = parts ? dateTimeInputToInstant(value) : null;
  const day = parts?.day ?? leadingDayOfDateTimeInput(value);
  const held = value.trim();
  // What is typed in the time field and is not (yet) the time the value holds.
  // It belongs to the value it was typed against: the form changing the value
  // from elsewhere (a reset) drops it. With no day chosen it is the time the day
  // picked next takes, as typed.
  const [typed, setTyped] = useState<{ text: string; value: string } | null>(
    null,
  );
  const draft = typed && typed.value === value ? typed.text : null;
  const time = draft ?? parts?.time ?? '';
  const zone = localTimeZone ?? browserTimeZone();
  const showsLocalTime = zone !== null && !isUtcZone(zone);
  // The button says what the value holds; the popover what the time being typed
  // makes of it, as soon as it is a time.
  const typedTime = day ? parseTimeOfDay(time) : null;
  const localHint = (utcInstant: string | null) =>
    showsLocalTime ? describeLocalTime(t, utcInstant, zone) : undefined;

  const write = (next: string, text: string | null) => {
    if (next !== value) {
      onChange(next);
    }
    setTyped(text === null ? null : { text, value: next });
  };

  const pickDay = (picked: string) => {
    write(
      joinDateTimeInput(picked, draft || parts?.time || MIDNIGHT),
      draft || null,
    );
  };

  const changeTime = (text: string) => {
    write(
      day && isTimeOfDay(text) ? joinDateTimeInput(day, text) : value,
      text,
    );
  };

  // Called as the person leaves the time field or the calendar. Returns whether
  // the time is a time (or nothing was typed): a text that is none is written to
  // the value as it is, for the form to refuse, and stays in the field.
  const settleTime = (): boolean => {
    if (draft === null) {
      return true;
    }
    if (draft === '') {
      write(value, null);

      return true;
    }
    const normal = parseTimeOfDay(draft);
    if (normal) {
      write(day ? joinDateTimeInput(day, normal) : value, day ? null : normal);

      return true;
    }
    if (day) {
      write(joinDateTimeInput(day, draft), draft);
    }

    return false;
  };

  return (
    <DatePickerShell
      {...props}
      aria-invalid={
        props['aria-invalid'] || (held !== '' && !parts) || undefined
      }
      dialogLabel={t('Common.datePicker.dateTimeDialog')}
      hint={localHint(instant)}
      onClear={() => {
        setTyped(null);
        onChange('');
      }}
      onClose={() => {
        settleTime();
      }}
      placeholder={placeholder ?? t('Common.pickDateTime')}
      text={
        instant
          ? formatDateTime(instant, {
              dateStyle: 'medium',
              hourCycle: 'h23',
              timeStyle: 'short',
              timeZone: 'UTC',
            })
          : held || undefined
      }
      value={parts ? joinDateTimeInput(parts.day, parts.time) : held}
    >
      {({ close }) => (
        <>
          <UtcDayCalendar day={day} onDayChange={pickDay} />
          <TimeOfDayInput
            localHint={localHint(
              typedTime
                ? dateTimeInputToInstant(joinDateTimeInput(day, typedTime))
                : null,
            )}
            onDone={() => {
              if (settleTime()) {
                close();
              }
            }}
            onSettle={settleTime}
            onTimeChange={changeTime}
            showsLocalTime={showsLocalTime}
            time={time}
          />
        </>
      )}
    </DatePickerShell>
  );
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

type TimeOfDayInputProps = {
  /** What the field shows: the time of the value, or what was typed and is not one yet. */
  time: string;
  /** Whether the zone of the browser is no UTC, so that the field says what its time is there. */
  showsLocalTime: boolean;
  /** What the time is on the clock of the browser, when it is a time. */
  localHint: string | undefined;
  /** Called with the text of the field each time it changes. */
  onTimeChange: (time: string) => void;
  /** Called as the field is left, to turn what was typed into the time it stands for. */
  onSettle: () => void;
  /** Called when the person presses Enter on a time: they are done with it. */
  onDone: () => void;
};

function TimeOfDayInput({
  time,
  showsLocalTime,
  localHint,
  onTimeChange,
  onSettle,
  onDone,
}: TimeOfDayInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = useId();
  const localId = useId();
  // `9:15` and `930` are times the field takes: it only complains of a text that
  // no correction makes one.
  const invalid = time !== '' && parseTimeOfDay(time) === null;

  return (
    <div className="space-y-1.5 border-t p-3 pt-2">
      <Label htmlFor={id}>
        {showsLocalTime
          ? t('Common.datePicker.timeUtcWithLocal')
          : t('Common.datePicker.timeUtc')}
      </Label>
      <Input
        aria-describedby={
          [showsLocalTime ? localId : undefined, invalid ? errorId : undefined]
            .filter(Boolean)
            .join(' ') || undefined
        }
        aria-invalid={invalid}
        autoComplete="off"
        id={id}
        inputMode="numeric"
        maxLength={5}
        onBlur={onSettle}
        onChange={(event) => onTimeChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            // Enter ends the time, not the form the calendar sits in.
            event.preventDefault();
            if (!invalid) {
              onDone();
            }
          }
        }}
        placeholder={MIDNIGHT}
        value={time}
      />
      {showsLocalTime ? (
        // There while the zone is not UTC, empty or not, so the popover keeps
        // its height as a time is typed.
        <p
          aria-live="polite"
          className="text-muted-foreground min-h-4 text-xs"
          data-slot="date-picker-local-time"
          id={localId}
        >
          {invalid ? null : localHint}
        </p>
      ) : null}
      {invalid ? (
        <p className="text-xs text-destructive-subtle-foreground" id={errorId}>
          {t('Common.datePicker.timeInvalid')}
        </p>
      ) : null}
    </div>
  );
}
