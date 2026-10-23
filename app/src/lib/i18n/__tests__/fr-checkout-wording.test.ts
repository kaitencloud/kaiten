import { describe, expect, it } from 'vite-plus/test';

import fr from '@/lib/i18n/locales/fr';

const lookup = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      fr,
    );

const strings = (node: unknown, path = ''): [string, string][] => {
  if (typeof node === 'string') {
    return [[path, node]];
  }
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) =>
      strings(value, path ? `${path}.${key}` : key),
    );
  }

  return [];
};

describe('the French wording of the checkout', () => {
  it.each([
    ['Features.AuditTrail.events.CHECKOUT_SESSION_STARTED', 'Checkout commencé'],
    ['Features.AuditTrail.events.CHECKOUT_SESSION_COMPLETED', 'Checkout terminé'],
    ['Features.AuditTrail.events.CHECKOUT_SESSION_ABANDONED', 'Checkout abandonné'],
  ])('labels %s', (key, label) => {
    expect(lookup(key)).toBe(label);
  });

  it('says the checkout is refused when a license names no fallback', () => {
    const text = lookup('Pages.Licenses.FallbackWarning.anonymousCheckout');

    expect(text).toContain('checkout anonyme');
    expect(text).toContain('ce checkout est refusé');
  });

  it('keeps the word checkout instead of translating it as paiement', () => {
    const offenders = strings(fr)
      .filter(([, text]) => /checkout/i.test(text) && /paiement/i.test(text))
      .map(([key]) => key);

    expect(offenders).toEqual([]);
  });
});
