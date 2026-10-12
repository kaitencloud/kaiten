import { describe, expect, it } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import {
  BILLING_MODEL_BLURB_KEYS,
  BILLING_MODEL_LABEL_KEYS,
  BILLING_MODELS,
  BILLING_PERIOD_LABEL_KEYS,
  BILLING_PERIOD_SUFFIX_KEYS,
  BILLING_PERIODS,
  BILLING_TIMING_BLURB_KEYS,
  BILLING_TIMING_LABEL_KEYS,
  BILLING_TIMINGS,
  PRICE_STATUS_LABEL_KEYS,
  RESET_PERIOD_UNIT_KEYS,
} from '../logic';

const read = (locale: unknown, key: string) =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      locale,
    );

// The words of a price are read on the page of a license version and on the page
// of an instance that is subscribed to one of its prices: they are the same
// words, in both languages, and a value the API adds has to be given its words.
describe('the words of a price', () => {
  const maps: Array<[string, Record<string, string>, readonly string[]]> = [
    ['models', BILLING_MODEL_LABEL_KEYS, BILLING_MODELS],
    ['model blurbs', BILLING_MODEL_BLURB_KEYS, BILLING_MODELS],
    ['periods', BILLING_PERIOD_LABEL_KEYS, BILLING_PERIODS],
    ['period suffixes', BILLING_PERIOD_SUFFIX_KEYS, BILLING_PERIODS],
    ['timings', BILLING_TIMING_LABEL_KEYS, BILLING_TIMINGS],
    ['timing blurbs', BILLING_TIMING_BLURB_KEYS, BILLING_TIMINGS],
    ['statuses', PRICE_STATUS_LABEL_KEYS, ['ACTIVE', 'DEPRECATED']],
    [
      'reset periods',
      RESET_PERIOD_UNIT_KEYS,
      ['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'],
    ],
  ];

  it.each(maps)('has a word for each of the %s', (_name, keys, values) => {
    expect(Object.keys(keys).sort()).toEqual([...values].sort());
  });

  it.each(maps)('reads the %s in English and in French', (_name, keys) => {
    for (const key of Object.values(keys)) {
      expect(read(en, key), `${key} in English`).toEqual(expect.any(String));
      expect(read(fr, key), `${key} in French`).toEqual(expect.any(String));
    }
  });
});
