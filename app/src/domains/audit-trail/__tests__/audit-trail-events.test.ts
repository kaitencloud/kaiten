import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';

import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';

import {
  AUDIT_EVENT_LABEL_KEYS,
  humanizeEventName,
  resolveEventLabel,
  resolveEventReason,
} from '../audit-trail-events';

const LOCALES = { en, fr } as const;

// `unknown` rather than `typeof en`: each locale infers its own string-literal
// types, so fr is not assignable to en's shape even though the trees match.
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

describe('audit event labels', () => {
  it.each(Object.entries(LOCALES))(
    'labels every event the API emits in %s',
    (_, locale) => {
      const missing = Object.values(AUDIT_EVENT_LABEL_KEYS).filter(
        (key) => typeof lookup(locale, key) !== 'string',
      );

      expect(missing).toEqual([]);
    },
  );

  it('reads a known event in the viewer’s language', () => {
    expect(resolveEventLabel('FEATURE_FLAG_UPDATED', translatorFor(en))).toBe(
      'Feature flag updated',
    );
    expect(resolveEventLabel('FEATURE_FLAG_UPDATED', translatorFor(fr))).toBe(
      'Feature flag mis à jour',
    );
    expect(
      resolveEventLabel('ENTITLEMENT_USAGE_REPORT_ACCEPTED', translatorFor(en)),
    ).toBe('Usage reported');
  });

  // The API can ship an event before the console knows its label: it reads as
  // a sentence rather than as the shouting constant it is sent as.
  it('reads an event this build does not know as a sentence', () => {
    expect(resolveEventLabel('WIDGET_FROBNICATED', translatorFor(fr))).toBe(
      'Widget frobnicated',
    );
    expect(humanizeEventName('LICENSE_ENTITLEMENT_ASSIGNED')).toBe(
      'License entitlement assigned',
    );
    expect(humanizeEventName('')).toBe('');
  });
});

describe('resolveEventReason', () => {
  it('says why billing moved an instance to its fallback license, in both languages', () => {
    const payload = { licenseChangeReason: 'BILLING_FALLBACK', slug: 'acme' };
    expect(
      resolveEventReason('INSTANCE_UPDATED', payload, translatorFor(en)),
    ).toBe(
      'Moved to the fallback license: its subscription ended, by a cancellation or a trial that ended without a payment method.',
    );
    expect(
      resolveEventReason('INSTANCE_UPDATED', payload, translatorFor(fr)),
    ).toMatch(/^Passée sur la licence de repli/);
  });

  it('gives none for any other change, another event, or a reason this build does not know', () => {
    const t = translatorFor(en);
    expect(
      resolveEventReason('INSTANCE_UPDATED', { licenseChangeReason: null }, t),
    ).toBeNull();
    expect(resolveEventReason('INSTANCE_UPDATED', null, t)).toBeNull();
    expect(
      resolveEventReason(
        'INSTANCE_UPDATED',
        { licenseChangeReason: 'SOMETHING_NEW' },
        t,
      ),
    ).toBeNull();
    expect(
      resolveEventReason(
        'LICENSE_UPDATED',
        { licenseChangeReason: 'BILLING_FALLBACK' },
        t,
      ),
    ).toBeNull();
  });
});
