import { describe, expect, it } from 'vite-plus/test';
import { useTimeZone } from '@/test-fixtures/time-zone';
import {
  browserTimeZone,
  isUtcZone,
  localTimeHint,
} from '../local-time-hint';

describe('localTimeHint', () => {
  it('says a UTC moment on the clock of Paris, with the zone and the place', () => {
    // 14:21 UTC is 16:21 in Paris in October: the moment a voucher that was to
    // start at 16:21 started two hours late.
    expect(
      localTimeHint('2026-10-18T14:21:00.000Z', {
        locale: 'en',
        timeZone: 'Europe/Paris',
      }),
    ).toEqual({ time: '16:21', place: 'Paris', zone: 'CEST' });
  });

  it('keeps the abbreviation of the zone whatever the language', () => {
    expect(
      localTimeHint('2026-10-18T14:21:00.000Z', {
        locale: 'fr',
        timeZone: 'Europe/Paris',
      }),
    ).toEqual({ time: '16:21', place: 'Paris', zone: 'CEST' });
    expect(
      localTimeHint('2026-10-18T14:21:00.000Z', {
        locale: 'fr',
        timeZone: 'America/Los_Angeles',
      }),
    ).toEqual({ time: '07:21', place: 'Los Angeles', zone: 'PDT' });
  });

  it('follows the clock changes of the zone', () => {
    expect(
      localTimeHint('2027-01-15T14:21:00.000Z', {
        locale: 'en',
        timeZone: 'Europe/Paris',
      }),
    ).toEqual({ time: '15:21', place: 'Paris', zone: 'CET' });
  });

  it('adds the day when it is not the UTC day', () => {
    expect(
      localTimeHint('2026-10-18T16:30:00.000Z', {
        locale: 'en',
        timeZone: 'Asia/Tokyo',
      }),
    ).toEqual({ time: 'Oct 19, 01:30', place: 'Tokyo', zone: 'GMT+9' });
    expect(
      localTimeHint('2026-10-18T16:30:00.000Z', {
        locale: 'fr',
        timeZone: 'Asia/Tokyo',
      })?.time,
    ).toBe('19 oct., 01:30');
  });

  it('adds the year when it is not the UTC year either', () => {
    expect(
      localTimeHint('2026-12-31T23:30:00.000Z', {
        locale: 'en',
        timeZone: 'Pacific/Kiritimati',
      })?.time,
    ).toBe('Jan 1, 2027, 13:30');
  });

  it('writes the time on the 24-hour clock, in the language of the app or not', () => {
    expect(
      localTimeHint('2026-10-18T22:05:00.000Z', {
        locale: 'en',
        timeZone: 'America/Los_Angeles',
      })?.time,
    ).toBe('15:05');
  });

  it('names a place from the last part of the zone, and none for a zone that has no place', () => {
    expect(
      localTimeHint('2026-10-18T14:21:00.000Z', {
        locale: 'en',
        timeZone: 'America/Argentina/Buenos_Aires',
      })?.place,
    ).toBe('Buenos Aires');
    expect(
      localTimeHint('2026-10-18T14:21:00.000Z', {
        locale: 'en',
        timeZone: 'Etc/GMT+5',
      }),
    ).toEqual({ time: '09:21', place: null, zone: 'GMT-5' });
  });

  it.each([
    ['Asia/Kolkata', '2026-10-18T14:21:00.000Z', '19:51', 'Kolkata'],
    ['Asia/Kathmandu', '2026-10-18T14:21:00.000Z', '20:06', 'Kathmandu'],
    ['Asia/Kolkata', '2026-10-18T22:00:00.000Z', 'Oct 19, 03:30', 'Kolkata'],
    ['Asia/Kathmandu', '2026-10-18T22:00:00.000Z', 'Oct 19, 03:45', 'Kathmandu'],
  ])('keeps the half hours of %s', (timeZone, instant, time, place) => {
    expect(localTimeHint(instant, { locale: 'en', timeZone })).toMatchObject({
      time,
      place,
    });
  });

  it('names the current place of a zone the browsers report under its old id', () => {
    expect(
      localTimeHint('2026-10-18T14:21:00.000Z', {
        locale: 'en',
        timeZone: 'Asia/Calcutta',
      })?.place,
    ).toBe('Kolkata');
    expect(
      localTimeHint('2026-10-18T14:21:00.000Z', {
        locale: 'en',
        timeZone: 'Asia/Saigon',
      })?.place,
    ).toBe('Ho Chi Minh');
  });

  it('names no place for a region id such as US/Pacific', () => {
    expect(
      localTimeHint('2026-10-18T14:21:00.000Z', {
        locale: 'en',
        timeZone: 'US/Pacific',
      })?.place,
    ).toBeNull();
  });

  it.each(['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Atlantic/Reykjavik', null])(
    'says nothing when the clock is %s',
    (timeZone) => {
      expect(
        localTimeHint('2026-10-18T14:21:00.000Z', { locale: 'en', timeZone }),
      ).toBeNull();
    },
  );

  it('says nothing while a zone sits at offset zero, and speaks once it does not', () => {
    // London is on UTC in winter, one hour ahead in summer.
    expect(
      localTimeHint('2027-01-15T14:21:00.000Z', {
        locale: 'en',
        timeZone: 'Europe/London',
      }),
    ).toBeNull();
    expect(
      localTimeHint('2026-10-10T14:21:00.000Z', {
        locale: 'en',
        timeZone: 'Europe/London',
      }),
    ).toEqual({ time: '15:21', place: 'London', zone: 'BST' });
  });

  it.each([null, '', 'not-a-moment'])('says nothing of %j', (instant) => {
    expect(
      localTimeHint(instant, { locale: 'en', timeZone: 'Europe/Paris' }),
    ).toBeNull();
  });

  it('says nothing of a zone the browser does not know', () => {
    expect(
      localTimeHint('2026-10-18T14:21:00.000Z', {
        locale: 'en',
        timeZone: 'Mars/Olympus_Mons',
      }),
    ).toBeNull();
  });
});

describe('isUtcZone', () => {
  it('knows the names of UTC, and no other zone', () => {
    expect(isUtcZone('UTC')).toBe(true);
    expect(isUtcZone('Etc/UTC')).toBe(true);
    expect(isUtcZone('Atlantic/Reykjavik')).toBe(true);
    expect(isUtcZone('Europe/London')).toBe(false);
    expect(isUtcZone('Europe/Paris')).toBe(false);
  });
});

describe('browserTimeZone', () => {
  describe.each(['Europe/Paris', 'Pacific/Kiritimati', 'America/Los_Angeles'])(
    'in %s',
    (zone) => {
      useTimeZone(zone);

      it('is the zone of the clock of the machine', () => {
        expect(browserTimeZone()).toBe(zone);
      });
    },
  );

  describe('in UTC', () => {
    useTimeZone('UTC');

    it('is UTC', () => {
      expect(browserTimeZone()).toBe('UTC');
    });
  });
});
