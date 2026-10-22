import { describe, expect, it } from 'vite-plus/test';
import {
  centredScrollTop,
  clearSegment,
  isCompleteTime,
  isFilledTime,
  isOutOfRange,
  joinTimeText,
  segmentNumber,
  setSegment,
  splitTimeText,
  stepSegment,
  typeDigit,
  type TimeSegments,
} from '../time-field-model';

const at = (hours: string, minutes: string): TimeSegments => ({
  hours,
  minutes,
});

describe('splitTimeText and joinTimeText', () => {
  it.each([
    ['09:30', at('09', '30')],
    ['09:--', at('09', '')],
    ['--:30', at('', '30')],
    ['--:--', at('', '')],
    ['', at('', '')],
    ['9:5', at('09', '05')],
    ['25:99', at('25', '99')],
    ['ab:cd', at('', '')],
  ])('reads %j as the segments %j', (text, segments) => {
    expect(splitTimeText(text)).toEqual(segments);
  });

  it('writes the two segments back, with -- for an empty one and nothing for none', () => {
    expect(joinTimeText(at('09', '30'))).toBe('09:30');
    expect(joinTimeText(at('09', ''))).toBe('09:--');
    expect(joinTimeText(at('', '30'))).toBe('--:30');
    expect(joinTimeText(at('', ''))).toBe('');
  });

  it('keeps a segment that is out of range as it is, and does not give it a number', () => {
    const segments = splitTimeText('25:99');

    expect(joinTimeText(segments)).toBe('25:99');
    expect(segmentNumber(segments, 'hours')).toBeNull();
    expect(segmentNumber(segments, 'minutes')).toBeNull();
    expect(isOutOfRange(segments, 'hours')).toBe(true);
    expect(isOutOfRange(at('', '30'), 'hours')).toBe(false);
    expect(isOutOfRange(at('23', '59'), 'minutes')).toBe(false);
  });

  it('says whether a text is a complete time', () => {
    expect(isCompleteTime('00:00')).toBe(true);
    expect(isCompleteTime('23:59')).toBe(true);
    expect(isCompleteTime('09:--')).toBe(false);
    expect(isCompleteTime('24:00')).toBe(false);
    expect(isCompleteTime('')).toBe(false);
  });
});

describe('stepSegment', () => {
  it('steps a segment and wraps it without carrying into the other', () => {
    expect(stepSegment(at('23', '15'), 'hours', 1)).toEqual(at('00', '15'));
    expect(stepSegment(at('00', '15'), 'hours', -1)).toEqual(at('23', '15'));
    expect(stepSegment(at('10', '59'), 'minutes', 1)).toEqual(at('10', '00'));
    expect(stepSegment(at('10', '00'), 'minutes', -1)).toEqual(at('10', '59'));
  });

  it('steps by a page and wraps', () => {
    expect(stepSegment(at('20', '00'), 'hours', 6)).toEqual(at('02', '00'));
    expect(stepSegment(at('10', '05'), 'minutes', -10)).toEqual(at('10', '55'));
  });

  it('starts an empty segment from the end the step points away from', () => {
    expect(stepSegment(at('', ''), 'hours', 1)).toEqual(at('00', ''));
    expect(stepSegment(at('', ''), 'hours', -1)).toEqual(at('23', ''));
    expect(stepSegment(at('10', ''), 'minutes', -1)).toEqual(at('10', '59'));
  });

  it('treats a segment out of range as empty', () => {
    expect(stepSegment(at('25', '30'), 'hours', 1)).toEqual(at('00', '30'));
  });
});

describe('setSegment and clearSegment', () => {
  it('sets a segment in two digits and empties one', () => {
    expect(setSegment(at('', ''), 'minutes', 5)).toEqual(at('', '05'));
    expect(clearSegment(at('10', '30'), 'hours')).toEqual(at('', '30'));
  });
});

describe('typeDigit', () => {
  const type = (
    segment: 'hours' | 'minutes',
    digits: string,
    start: TimeSegments = at('', ''),
  ) => {
    let segments = start;
    let pending: string | null = null;
    for (const digit of digits) {
      ({ segments, pending } = typeDigit(segments, segment, digit, pending));
    }

    return { segments, pending };
  };

  it('waits after a first digit another could follow', () => {
    expect(type('hours', '1')).toEqual({
      segments: at('01', '00'),
      pending: '1',
    });
    expect(type('hours', '0').pending).toBe('0');
    expect(type('hours', '2').pending).toBe('2');
    expect(type('minutes', '5').pending).toBe('5');
  });

  it('ends the entry of the hours after a first digit that no second could follow', () => {
    expect(type('hours', '3')).toEqual({
      segments: at('03', '00'),
      pending: null,
    });
    expect(type('hours', '9').segments).toEqual(at('09', '00'));
    expect(type('minutes', '9').segments).toEqual(at('', '09'));
  });

  it('completes the pair with a second digit', () => {
    expect(type('hours', '16')).toEqual({
      segments: at('16', '00'),
      pending: null,
    });
    expect(type('hours', '23').segments.hours).toBe('23');
    expect(type('minutes', '59').segments.minutes).toBe('59');
    expect(type('hours', '09').segments.hours).toBe('09');
  });

  it('keeps a pair that is out of range as it was typed, and ends the entry there', () => {
    // 2 then 4 is 24 hours, not 02 with the 4 dropped: the segment shows what was
    // typed and is out of range, for the caller to refuse.
    expect(type('hours', '24')).toEqual({
      segments: at('24', '00'),
      pending: null,
    });
    expect(type('hours', '25').segments.hours).toBe('25');
    expect(type('hours', '29').segments.hours).toBe('29');
    expect(isOutOfRange(type('hours', '24').segments, 'hours')).toBe(true);
    // Likewise in the minutes, where a first digit of 6 to 9 waits for a second.
    expect(type('minutes', '60')).toEqual({ segments: at('', '60'), pending: null });
    expect(type('minutes', '99').segments.minutes).toBe('99');
    expect(isOutOfRange(type('minutes', '60').segments, 'minutes')).toBe(true);
  });

  it('never turns the digits typed into another time', () => {
    // The hours of `2400` end at `24`, and the minutes are the next two digits.
    expect(type('hours', '24').segments.hours).toBe('24');
    expect(type('minutes', '00').segments.minutes).toBe('00');
    // The pair of the minutes that follows the first digit is not read as `06`
    // and then `00`.
    expect(type('minutes', '60').segments.minutes).not.toBe('00');
  });

  it('starts a new entry once an entry is over', () => {
    expect(type('hours', '1623').segments.hours).toBe('23');
    expect(type('hours', '253').segments.hours).toBe('03');
    expect(type('minutes', '5930').segments.minutes).toBe('30');
  });

  it('gives a time typed in the hours the minutes 00 when it has none, and leaves the ones it has', () => {
    // The same `10` on a field that was cleared and on one that holds 00:00.
    expect(type('hours', '10').segments).toEqual(at('10', '00'));
    expect(type('hours', '10', at('00', '00')).segments).toEqual(at('10', '00'));
    expect(type('hours', '16', at('09', '30')).segments).toEqual(at('16', '30'));
    // The minutes are not given hours: a time with none is refused, not guessed.
    expect(type('minutes', '30').segments).toEqual(at('', '30'));
  });

  it('overwrites what the segment held', () => {
    expect(type('hours', '7', at('10', '30')).segments).toEqual(at('07', '30'));
  });
});

describe('isFilledTime', () => {
  it('says whether both segments hold a text, in range or not', () => {
    expect(isFilledTime('09:30')).toBe(true);
    expect(isFilledTime('24:00')).toBe(true);
    expect(isFilledTime('12:60')).toBe(true);
    expect(isFilledTime('09:--')).toBe(false);
    expect(isFilledTime('--:30')).toBe(false);
    expect(isFilledTime('')).toBe(false);
  });
});

describe('centredScrollTop', () => {
  // 28px rows, seven in view: the hours are 24 rows, the minutes 60.
  const hours = (index: number | null) => centredScrollTop(index, 24, 7, 28);
  const minutes = (index: number | null) => centredScrollTop(index, 60, 7, 28);

  it('puts the first values on the first rows, with nothing above', () => {
    expect(hours(0)).toBe(0);
    expect(hours(1)).toBe(0);
    expect(hours(3)).toBe(0);
    expect(minutes(0)).toBe(0);
  });

  it('centres a value that has three rows on each side', () => {
    expect(hours(4)).toBe(28);
    expect(hours(12)).toBe(9 * 28);
    expect(minutes(30)).toBe(27 * 28);
  });

  it('puts the last values on the last rows, with nothing below', () => {
    expect(hours(20)).toBe(17 * 28);
    expect(hours(23)).toBe(17 * 28);
    expect(minutes(59)).toBe(53 * 28);
    expect(minutes(56)).toBe(53 * 28);
  });

  it('starts at the top while nothing is chosen', () => {
    expect(hours(null)).toBe(0);
    expect(minutes(null)).toBe(0);
  });

  it('never goes below 0 when the column is shorter than the view', () => {
    expect(centredScrollTop(2, 5, 7, 28)).toBe(0);
  });
});
