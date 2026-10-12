import { describe, expect, it } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { CONNECTORS } from './constants';

function translationAt(locale: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      locale,
    );
}

// A tagline is a translation key held in a plain string and read with a dynamic `t(...)`,
// so `check:i18n-keys` does not see it: a mistyped key would print itself on the tile.
describe('the connector catalog', () => {
  it('holds every connector the console draws, Attio and Stripe included', () => {
    expect(CONNECTORS.map((connector) => connector.id)).toEqual(
      expect.arrayContaining(['attio', 'stripe']),
    );
  });

  it.each(CONNECTORS.map((connector) => [connector.id, connector.tagline] as const))(
    'has a tagline in English and in French for %s',
    (_id, tagline) => {
      for (const locale of [en, fr]) {
        const text = translationAt(locale, tagline);

        expect(text).toEqual(expect.any(String));
        expect(text).not.toBe('');
      }
    },
  );
});
