import { dateInputToCalendarDate } from './date-input';

// What a `datetime-local` input holds: a date, a time and no zone. The console
// reads it as UTC, as it writes every billing time.
const DATE_TIME_INPUT = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/;

/**
 * The instant a `datetime-local` value stands for, read as UTC and written as
 * the API takes it (`2027-03-03T10:00:00.000Z`). Null for an empty value or one
 * that is not a date and a time. The input holds no zone, so a form that asks
 * for a time says in its label which one it reads: UTC, for billing.
 */
export function dateTimeInputToInstant(value: string): string | null {
  const match = DATE_TIME_INPUT.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, date, time, seconds = '00'] = match;
  const instant = new Date(`${date}T${time}:${seconds}.000Z`);

  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/**
 * The text a `datetime-local` input holds for an instant, in UTC and to the
 * minute (`2027-03-03T10:00`), or an empty text for a value that is not an
 * instant: what a form puts in the field to start from a date it knows.
 */
export function instantToDateTimeInput(instant: string | undefined): string {
  const date = instant ? new Date(instant) : null;

  return date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 16)
    : '';
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whether a text is a time of day to the minute, as a time input holds it: `09:30`. */
export function isTimeOfDay(value: string): boolean {
  return TIME_OF_DAY.test(value);
}

/**
 * The two halves of a `datetime-local` text, the day (`2027-03-03`) and the time
 * (`10:00`), for the two controls that set them. Seconds are dropped, as the
 * field holds none. Null for an empty text or one that is not a real day and a
 * time of day.
 */
export function splitDateTimeInput(
  value: string,
): { day: string; time: string } | null {
  const match = DATE_TIME_INPUT.exec(value.trim());
  if (!match || !dateInputToCalendarDate(match[1]) || !isTimeOfDay(match[2])) {
    return null;
  }

  return { day: match[1], time: match[2] };
}

/** The `datetime-local` text for a day and a time: the reverse of `splitDateTimeInput`. */
export function joinDateTimeInput(day: string, time: string): string {
  return `${day}T${time}`;
}
