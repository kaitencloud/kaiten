import type { TFunction } from 'i18next';
import { getWebhookEvent, getWebhookEventLabel } from './webhook-events';

// The event picker's search. Each event is found by its label in the viewer's
// language, its NAME (CUSTOMER_CREATED, also with spaces for underscores) and
// its type (com.kaiten.customer.v1.created); group titles are not searched.
// Case and accents are ignored, so "creation" finds "Création". Every term of
// the query must be found; an empty query matches every event.

/** Lower-cased, without accents: the form both sides are compared in. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The terms of a query: an empty array matches everything. */
export function parseEventSearchQuery(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

/** What the search reads for each type, built once per language. */
export function buildEventSearchIndex(
  types: readonly string[],
  t: TFunction,
): ReadonlyMap<string, string> {
  return new Map(
    types.map((type) => {
      const event = getWebhookEvent(type);
      const parts = [getWebhookEventLabel(type, t), type];
      if (event) {
        parts.push(event.name, event.name.replaceAll('_', ' '));
      }
      return [type, normalizeSearchText(parts.join('\n'))];
    }),
  );
}

/** Whether the type's indexed text holds every term. */
export function matchesEventSearch(
  index: ReadonlyMap<string, string>,
  type: string,
  terms: readonly string[],
): boolean {
  if (terms.length === 0) return true;
  const haystack = index.get(type) ?? normalizeSearchText(type);
  return terms.every((term) => haystack.includes(term));
}
