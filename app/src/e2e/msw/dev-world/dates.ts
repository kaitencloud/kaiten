const MINUTE_IN_MS = 60_000;
const DAY_IN_MINUTES = 24 * 60;

// The world is dated from the moment the console starts, so what a page
// measures from today (a license that ends soon, a customer added this month,
// how old an event is) reads the same whatever the day.

export const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * MINUTE_IN_MS).toISOString();

export const daysAgo = (days: number) => minutesAgo(days * DAY_IN_MINUTES);

export const daysFromNow = (days: number) => daysAgo(-days);

/** The calendar month under way, the period of a monthly usage. */
export const currentMonth = () => {
  const now = new Date();
  const monthStart = (offset: number) =>
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
    ).toISOString();
  return { currentPeriodEnd: monthStart(1), currentPeriodStart: monthStart(0) };
};
