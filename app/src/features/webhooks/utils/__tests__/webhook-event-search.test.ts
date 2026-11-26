import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { WEBHOOK_EVENTS } from '../webhook-event-catalogue';
import {
  buildEventSearchIndex,
  matchesEventSearch,
  normalizeSearchText,
  parseEventSearchQuery,
} from '../webhook-event-search';
import { SUBSCRIBABLE_WEBHOOK_EVENTS } from '../webhook-events';

const lookup = (locale: unknown, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      locale,
    );

const translatorFor = (locale: unknown) =>
  ((key: string) => {
    const value = lookup(locale, key);
    return typeof value === 'string' ? value : key;
  }) as unknown as TFunction;

const UNKNOWN = 'com.kaiten.future.v1.created';
const OFFERED = SUBSCRIBABLE_WEBHOOK_EVENTS.flatMap((entry) =>
  entry.events.map((event) => event.type as string),
);

const search = (query: string, t: TFunction) => {
  const index = buildEventSearchIndex([...OFFERED, UNKNOWN], t);
  const terms = parseEventSearchQuery(query);
  return [...OFFERED, UNKNOWN].filter((type) =>
    matchesEventSearch(index, type, terms),
  );
};

describe('webhook event search', () => {
  it('folds case and accents', () => {
    expect(normalizeSearchText('Création FACTURE')).toBe('creation facture');
    expect(parseEventSearchQuery('  Invoice   PAID ')).toEqual(['invoice', 'paid']);
  });

  it('finds an event by its label, with every term required', () => {
    expect(search('invoice paid', translatorFor(en))).toEqual([
      WEBHOOK_EVENTS.INSTANCE_INVOICE_PAID.type,
    ]);
  });

  it('finds a French label without its accents', () => {
    expect(search('client cree', translatorFor(fr))).toContain(
      WEBHOOK_EVENTS.CUSTOMER_CREATED.type,
    );
  });

  it('finds an event by its NAME, with or without underscores', () => {
    const t = translatorFor(en);

    expect(search('customer_created', t)).toEqual([WEBHOOK_EVENTS.CUSTOMER_CREATED.type]);
    expect(search('usage_reached', t)).toContain(
      WEBHOOK_EVENTS.INSTANCE_ENTITLEMENT_USAGE_REACHED.type,
    );
  });

  it('finds an event by its type, and an unknown type by its text', () => {
    const t = translatorFor(en);

    expect(search('com.kaiten.customer.v1.created', t)).toEqual([
      WEBHOOK_EVENTS.CUSTOMER_CREATED.type,
    ]);
    expect(search('future', t)).toEqual([UNKNOWN]);
  });

  it('matches everything for an empty query and nothing for a stray one', () => {
    const t = translatorFor(en);

    expect(search('   ', t)).toHaveLength(OFFERED.length + 1);
    expect(search('zzz', t)).toEqual([]);
  });
});
