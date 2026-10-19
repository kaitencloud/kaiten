/**
 * The rules of a time of day shown as two segments, `HH` and `mm`, on the
 * 24-hour clock: how a text is split in two, how a segment steps, wraps and
 * takes the digits typed into it. Pure functions: the `TimeField` component
 * holds the state and the keyboard, this file holds the arithmetic.
 *
 * A time is a text. A complete one is `09:30`. A segment that holds nothing
 * (not filled yet, or cleared) is written `--`, so a half-filled time is
 * `09:--`, and a time with both segments empty is the empty text. The text of a
 * segment that is out of range (`25` in the hours) is kept as it is, so that a
 * value a form hands in and that is no time is shown, not silently corrected.
 */

export type TimeSegment = 'hours' | 'minutes';

export type TimeSegments = Record<TimeSegment, string>;

/** The highest value of each segment: the lowest is 0. */
export const SEGMENT_MAX: Record<TimeSegment, number> = {
  hours: 23,
  minutes: 59,
};

/** How far Page Up and Page Down move a segment: a quarter of a day, ten minutes. */
export const SEGMENT_PAGE: Record<TimeSegment, number> = {
  hours: 6,
  minutes: 10,
};

const EMPTY_SEGMENT = '--';

const pad = (value: number) => String(value).padStart(2, '0');

// `9` is read as `09`, `--` and anything that is not digits as nothing.
function readSegment(text: string | undefined): string {
  return /^\d{1,2}$/.test(text ?? '') ? pad(Number(text)) : '';
}

/**
 * The two segments of a time text, each a two-digit text or `''` when empty:
 * `09:30` gives `{ hours: '09', minutes: '30' }`, `09:--` gives
 * `{ hours: '09', minutes: '' }`.
 */
export function splitTimeText(text: string): TimeSegments {
  const [hours, minutes] = text.split(':');

  return { hours: readSegment(hours), minutes: readSegment(minutes) };
}

/** The text of two segments: the reverse of `splitTimeText`, and `''` when both are empty. */
export function joinTimeText({ hours, minutes }: TimeSegments): string {
  if (!hours && !minutes) {
    return '';
  }

  return `${hours || EMPTY_SEGMENT}:${minutes || EMPTY_SEGMENT}`;
}

/** The number a segment holds, or null when it is empty or out of range. */
export function segmentNumber(
  segments: TimeSegments,
  segment: TimeSegment,
): number | null {
  const text = segments[segment];
  if (!text) {
    return null;
  }
  const value = Number(text);

  return value <= SEGMENT_MAX[segment] ? value : null;
}

/** Whether a segment holds a text that is no value of its range (`25` hours). */
export function isOutOfRange(
  segments: TimeSegments,
  segment: TimeSegment,
): boolean {
  return segments[segment] !== '' && segmentNumber(segments, segment) === null;
}

/** The text of the time with one segment set to a number, wrapped into its range. */
export function setSegment(
  segments: TimeSegments,
  segment: TimeSegment,
  value: number,
): TimeSegments {
  return { ...segments, [segment]: pad(wrap(value, segment)) };
}

/** The text of the time with one segment emptied. */
export function clearSegment(
  segments: TimeSegments,
  segment: TimeSegment,
): TimeSegments {
  return { ...segments, [segment]: '' };
}

function wrap(value: number, segment: TimeSegment): number {
  const size = SEGMENT_MAX[segment] + 1;

  return ((value % size) + size) % size;
}

/**
 * A segment moved by `delta` and wrapped: 23 plus one is 00, and 00 minus one is
 * 23, with no carry into the other segment. An empty or out-of-range segment
 * starts from the end the step points away from, so going up gives 00 and
 * going down gives the last value.
 */
export function stepSegment(
  segments: TimeSegments,
  segment: TimeSegment,
  delta: number,
): TimeSegments {
  const current = segmentNumber(segments, segment);
  if (current === null) {
    return setSegment(segments, segment, delta > 0 ? 0 : SEGMENT_MAX[segment]);
  }

  return setSegment(segments, segment, current + delta);
}

export type DigitResult = {
  segments: TimeSegments;
  /** The first digit of a two-digit entry, kept while the second is awaited. */
  pending: string | null;
  /** Whether nothing more can follow in this segment, so the focus moves on. */
  done: boolean;
};

/**
 * A digit typed into a segment. A first digit that no second digit could follow
 * (`3` to `9` in the hours, `6` to `9` in the minutes) fills the segment and is
 * done; a first digit that could (`1`, or `0` and `2` in the hours) fills it as
 * `01` and waits. The second digit completes the pair when the pair is in range
 * (`16`), and otherwise starts a new entry (`2` then `5` is `02`, then `05`).
 */
export function typeDigit(
  segments: TimeSegments,
  segment: TimeSegment,
  digit: string,
  pending: string | null,
): DigitResult {
  const max = SEGMENT_MAX[segment];

  if (pending !== null) {
    const pair = Number(`${pending}${digit}`);
    if (pair <= max) {
      return {
        segments: setSegment(segments, segment, pair),
        pending: null,
        done: true,
      };
    }
  }

  const value = Number(digit);
  const tens = Math.floor(max / 10);
  const done = value > tens;

  return {
    segments: setSegment(segments, segment, value),
    pending: done ? null : digit,
    done,
  };
}

/** Whether a time text is a complete time of day: both segments in range. */
export function isCompleteTime(text: string): boolean {
  const segments = splitTimeText(text);

  return (
    segmentNumber(segments, 'hours') !== null &&
    segmentNumber(segments, 'minutes') !== null
  );
}
