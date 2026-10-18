/**
 * The day inputs of a form (`type="date"`, the text `2027-03-01`) and the instants
 * the API takes a period in. A day is read in UTC, as every billing period is: the
 * same text means the same instant for everybody.
 */

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The instant a date input stands for: midnight at the start of that day, in UTC,
 * as the API takes a period (`2027-03-01T00:00:00.000Z`). Nothing for an empty
 * input or one that is not a date.
 */
export function dateInputToInstant(value: string): string | undefined {
  const match = DATE_INPUT.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const instant = new Date(`${value.trim()}T00:00:00.000Z`);

  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
}

/** The UTC day an instant falls on, as a date input holds it: `2027-03-01`. */
export function instantToDateInput(instant: string | null | undefined): string {
  const date = instant ? new Date(instant) : null;

  return date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : '';
}

/** Whether a period ends before it starts, or on the instant it starts: the API refuses it. */
export function isPeriodInvalid(
  from: string | undefined,
  to: string | undefined,
): boolean {
  return (
    from !== undefined && to !== undefined && Date.parse(from) >= Date.parse(to)
  );
}

/**
 * The day a date input holds, as a calendar takes it: a `Date` on that calendar
 * day at noon, in the zone of the browser. A calendar reads and reports days with
 * the local fields of a `Date`, so the same day shows in every zone; noon keeps
 * a zone whose clocks skip midnight from moving it. The zone says nothing about
 * the day: the text is the UTC day and stays so. Nothing for an empty text, one
 * that is not a date, or a day that does not exist (`2027-02-31`).
 */
export function dateInputToCalendarDate(value: string): Date | undefined {
  const match = DATE_INPUT.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(year, month - 1, day, 12);
  date.setFullYear(year);

  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined;
}

/**
 * The text a date input holds for the day a calendar reports, read with the local
 * fields of the `Date` as `dateInputToCalendarDate` writes them. Not `toISOString`,
 * which would move the day east or west of UTC.
 */
export function calendarDateToDateInput(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
