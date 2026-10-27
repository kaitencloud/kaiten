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
 * value a form hands in and that is no time is shown, not silently corrected;
 * the digits a person types are kept as they are too (see `typeDigit`).
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
  /**
   * The first digit of a two-digit entry, kept while the second is awaited.
   * Null once the entry is over, which is when the focus moves on from the hours.
   */
  pending: string | null;
};

/**
 * A digit typed into a segment. A first digit that no second digit could follow
 * (`3` to `9` in the hours) fills the segment and ends the entry; a first digit
 * that could (`1`, or `0` and `2` in the hours) fills it as `01` and waits for a
 * second one.
 *
 * A pair that is out of range (`24` to `29` in the hours, `60` to `99` in the
 * minutes) is kept as it was typed, and the entry ends there: the segment shows
 * it, marked invalid, so that the time that results is one the person typed and
 * never another one. Refusing it is the caller's. Once an entry is over the next
 * digit starts a new one, as the time input of a browser does. In the minutes,
 * the last segment, where no other would take the digit, a first digit of `6` to
 * `9` also waits for a second: `60` is a pair out of range, not `06` and then
 * `00`.
 *
 * Typing the hours of a time that has no minutes gives it `00` minutes, as a day
 * picked starts the time at `00:00`: `10` on a field that was cleared gives
 * `10:00`, as it does on a fresh one, where the minutes were already `00`.
 */
export function typeDigit(
  segments: TimeSegments,
  segment: TimeSegment,
  digit: string,
  pending: string | null,
): DigitResult {
  if (pending !== null) {
    return {
      segments: withTyped(segments, segment, Number(`${pending}${digit}`)),
      pending: null,
    };
  }

  const ends =
    segment === 'hours' && Number(digit) > Math.floor(SEGMENT_MAX.hours / 10);

  return {
    segments: withTyped(segments, segment, Number(digit)),
    pending: ends ? null : digit,
  };
}

// The segments with the typed number in one, in two digits, and the minutes at
// `00` when hours are typed and there are none.
function withTyped(
  segments: TimeSegments,
  segment: TimeSegment,
  typed: number,
): TimeSegments {
  const next = { ...segments, [segment]: pad(typed) };

  return segment === 'hours' && next.minutes === ''
    ? { ...next, minutes: pad(0) }
    : next;
}

/**
 * Whether both segments hold a text, in range or not: a time typed to the end,
 * which is either a time or one that is none, as opposed to one half filled.
 */
export function isFilledTime(text: string): boolean {
  const { hours, minutes } = splitTimeText(text);

  return hours !== '' && minutes !== '';
}

/** Whether a time text is a complete time of day: both segments in range. */
export function isCompleteTime(text: string): boolean {
  const segments = splitTimeText(text);

  return (
    segmentNumber(segments, 'hours') !== null &&
    segmentNumber(segments, 'minutes') !== null
  );
}

/**
 * Where a column of `rows` rows, `visibleRows` of them in view, scrolls to put
 * row `index` in the middle. It stops at both ends instead of leaving room: the
 * first rows sit on the first line and the last on the last, so a column is
 * full from its top to its bottom. A missing `index` is the top.
 */
export function centredScrollTop(
  index: number | null,
  rows: number,
  visibleRows: number,
  rowHeight: number,
): number {
  const last = Math.max(0, rows - visibleRows) * rowHeight;
  const centred = ((index ?? 0) - (visibleRows - 1) / 2) * rowHeight;

  return Math.min(last, Math.max(0, centred));
}
