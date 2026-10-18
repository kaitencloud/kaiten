/**
 * The local equivalent of a UTC moment, for the pickers that take a time in UTC
 * while the person thinks of it in the zone of their own clock: the voucher
 * that was to start at 16:21 in Paris started at 16:21 UTC, two hours late.
 * Nothing here changes a value; it only words what a UTC moment is, where the
 * person is.
 */

// The names a zone of offset zero all year goes by. A browser reports one of
// them as its zone when the machine runs in UTC, and says nothing the UTC
// moment does not already say.
const UTC_ZONES = new Set([
  'UTC',
  'Etc/UTC',
  'Etc/UCT',
  'UCT',
  'Etc/Universal',
  'Universal',
  'Etc/Zulu',
  'Zulu',
  'Etc/GMT',
  'Etc/GMT0',
  'Etc/GMT+0',
  'Etc/GMT-0',
  'Etc/Greenwich',
  'GMT',
  'GMT0',
  'Greenwich',
]);

/** The zone of the clock of the browser (`Europe/Paris`), or null when it does not say. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Whether a zone is UTC itself, the one a local equivalent is no use in. */
export function isUtcZone(zone: string): boolean {
  return UTC_ZONES.has(zone);
}

export type LocalTimeHint = {
  /** The time of day, `18:21`, with the day (`Oct 19, 01:30`) when it is not the UTC day. */
  time: string;
  /** A readable name for the zone, `Paris`, or null for a zone that has no place (`Etc/GMT+5`). */
  place: string | null;
  /** The short name of the zone at that moment, `CEST`, or the offset (`GMT+9`) where it has none. */
  zone: string;
};

// A zone name that is only the offset: what a locale falls back to when it has
// no abbreviation for the zone.
const OFFSET_NAME = /^(GMT|UTC)(?![A-Za-z])/;

function dayParts(date: Date, locale: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;

  return { year: part('year'), month: part('month'), day: part('day') };
}

function zoneName(date: Date, locale: string, timeZone: string): string {
  const name = (inLocale: string) =>
    new Intl.DateTimeFormat(inLocale, { timeZone, timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? '';
  const own = name(locale);
  if (own && !OFFSET_NAME.test(own)) {
    return own;
  }
  // The abbreviations of a zone (`CEST`, `PDT`) are not the language of the app
  // but of the places that use them: ask the locales that know them before
  // settling for an offset.
  for (const other of ['en-US', 'en-GB']) {
    const abbreviation = name(other);
    if (abbreviation && !OFFSET_NAME.test(abbreviation)) {
      return abbreviation;
    }
  }

  return own;
}

function placeOf(timeZone: string): string | null {
  const [area, ...rest] = timeZone.split('/');
  if (rest.length === 0 || area === 'Etc') {
    return null;
  }

  return (rest.at(-1) as string).replaceAll('_', ' ');
}

/**
 * What a UTC moment is in a zone, on the 24-hour clock of the pickers. The day
 * is part of it when it is not the UTC day, the year when that differs too.
 * Null for no moment, a zone that is UTC, or one the browser does not know.
 */
export function localTimeHint(
  instant: string | null,
  { locale, timeZone }: { locale: string; timeZone: string | null },
): LocalTimeHint | null {
  if (!instant || !timeZone || isUtcZone(timeZone)) {
    return null;
  }
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    const local = dayParts(date, locale, timeZone);
    const utc = dayParts(date, locale, 'UTC');
    const sameDay =
      local.year === utc.year &&
      local.month === utc.month &&
      local.day === utc.day;
    const options: Intl.DateTimeFormatOptions = {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(sameDay
        ? {}
        : {
            month: 'short',
            day: 'numeric',
            ...(local.year === utc.year ? {} : { year: 'numeric' }),
          }),
    };

    return {
      time: new Intl.DateTimeFormat(locale, options).format(date),
      place: placeOf(timeZone),
      zone: zoneName(date, locale, timeZone),
    };
  } catch {
    return null;
  }
}
