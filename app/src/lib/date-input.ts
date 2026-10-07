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
export function instantToDateInput(instant: string | undefined): string {
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
