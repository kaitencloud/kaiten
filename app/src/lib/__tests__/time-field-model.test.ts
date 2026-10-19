import { describe, expect, it } from 'vite-plus/test';
import {
  clearSegment,
  isCompleteTime,
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
    let done = false;
    for (const digit of digits) {
      ({ segments, pending, done } = typeDigit(segments, segment, digit, pending));
    }

    return { segments, pending, done };
  };

  it('waits after a first digit another could follow', () => {
    expect(type('hours', '1')).toEqual({
      segments: at('01', ''),
      pending: '1',
      done: false,
    });
    expect(type('hours', '0').pending).toBe('0');
    expect(type('hours', '2').pending).toBe('2');
    expect(type('minutes', '5').pending).toBe('5');
  });

  it('moves on after a first digit that no second could follow', () => {
    expect(type('hours', '3')).toEqual({
      segments: at('03', ''),
      pending: null,
      done: true,
    });
    expect(type('minutes', '6').done).toBe(true);
    expect(type('minutes', '9').segments).toEqual(at('', '09'));
  });

  it('completes the pair with a second digit', () => {
    expect(type('hours', '16')).toEqual({
      segments: at('16', ''),
      pending: null,
      done: true,
    });
    expect(type('hours', '23').segments.hours).toBe('23');
    expect(type('minutes', '59').segments.minutes).toBe('59');
    expect(type('hours', '09').segments.hours).toBe('09');
  });

  it('ignores a second digit that would make the pair out of range', () => {
    // 2 then 5 is not 25 hours, and the 5 is not taken for another entry: the
    // hours stay 02, awaiting a digit that can follow.
    expect(type('hours', '25')).toEqual({
      segments: at('02', ''),
      pending: '2',
      done: false,
    });
    expect(type('hours', '24').segments.hours).toBe('02');
    // A digit that can follow still completes the entry.
    expect(type('hours', '253').segments.hours).toBe('23');
  });

  it('says a digit was ignored, and changes nothing', () => {
    const typed = type('hours', '2').segments;

    expect(typeDigit(typed, 'hours', '7', '2')).toEqual({
      segments: typed,
      pending: '2',
      done: false,
      ignored: true,
    });
    expect(typeDigit(typed, 'hours', '3', '2').ignored).toBe(false);
  });

  it('starts a new entry once an entry is complete', () => {
    // 6 fills the minutes and is complete, so the 0 after it is a new entry:
    // 60 is 06 and then 00, never 60.
    expect(type('minutes', '60').segments.minutes).toBe('00');
    expect(type('hours', '1623').segments.hours).toBe('23');
  });

  it('overwrites what the segment held', () => {
    expect(type('hours', '7', at('10', '30')).segments).toEqual(at('07', '30'));
  });
});
