import { afterEach, beforeEach, expect } from 'vite-plus/test';

/**
 * Two zones to run a date test in, one east of Greenwich and one west, each with
 * a moment at which the day there is not the UTC day: the UTC day of `utcMoment`
 * is the 7th of October 2026 in both. A runner in UTC cannot tell a date written
 * from the local fields of a `Date` from one written in UTC, so a test about
 * "whatever the zone of the browser" has to set a zone of its own.
 */
export const TEST_ZONES = [
  { zone: 'Pacific/Kiritimati', utcMoment: '2026-10-07T23:30:00.000Z' },
  { zone: 'America/Los_Angeles', utcMoment: '2026-10-07T03:30:00.000Z' },
] as const;

/** The UTC day of the `utcMoment` of every zone of `TEST_ZONES`. */
export const TEST_ZONES_UTC_DAY = '2026-10-07';

/**
 * Runs the tests of the enclosing `describe` with the clock of the machine in
 * `zone`, and puts the zone back after each one. Node reads `TZ` again each time
 * it is set, so no new process is needed. `'UTC'` is a zone too: it pins a test
 * of a UTC picker to the same clock on every machine, where no local time shows.
 */
export function useTimeZone(zone: string, utcMoment?: string) {
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.TZ;
    process.env.TZ = zone;
    // Guard against a zone that did not apply (a runner that ignores `TZ`),
    // where every test below would pass for the wrong reason. UTC is the one
    // zone that has no offset to check.
    if (zone !== 'UTC') {
      expect(new Date('2027-01-15T12:00:00.000Z').getTimezoneOffset()).not.toBe(
        0,
      );
    }
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
    if (utcMoment) {
      expect(new Date(utcMoment).getDate()).not.toBe(
        Number(TEST_ZONES_UTC_DAY.slice(-2)),
      );
    }
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  });
}
