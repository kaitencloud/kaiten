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
