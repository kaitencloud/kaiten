/** The most days an invoice may be due after it is issued: the API takes payment terms from 0 to this. */
export const MAX_DAYS_UNTIL_DUE = 365;

/** Whether `days` is a number of days the API takes as payment terms: a whole number from 0 to a year. */
export function isValidDaysUntilDue(days: number): boolean {
  return Number.isInteger(days) && days >= 0 && days <= MAX_DAYS_UNTIL_DUE;
}
