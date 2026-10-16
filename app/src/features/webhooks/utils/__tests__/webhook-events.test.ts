import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';

import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';

import { WEBHOOK_EVENT_GROUPS, WEBHOOK_EVENTS } from '../webhook-event-catalogue';
import {
  getWebhookEvent,
  getWebhookEventGroupLabel,
  getWebhookEventLabel,
  getWebhookEventOptionLabel,
  SUBSCRIBABLE_WEBHOOK_EVENTS,
} from '../webhook-events';

const LOCALES = { en, fr } as const;

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

describe('webhook events', () => {
  it.each(Object.entries(LOCALES))(
    'titles every group, and the unknown events, in %s',
    (_, locale) => {
      const keys = [...WEBHOOK_EVENT_GROUPS, 'other'].map(
        (group) => `Pages.Integrations.Webhooks.EventGroups.${group}`,
      );

      expect(keys.filter((key) => typeof lookup(locale, key) !== 'string')).toEqual(
        [],
      );
    },
  );

  it('publishes each event under a type of its own', () => {
    const types = Object.values(WEBHOOK_EVENTS).map((event) => event.type);

    expect(new Set(types).size).toBe(types.length);
  });

  it('offers every event but the high-volume reads, each group non-empty', () => {
    const offered = SUBSCRIBABLE_WEBHOOK_EVENTS.flatMap((entry) =>
      entry.events.map((event) => event.name),
    );

    expect(SUBSCRIBABLE_WEBHOOK_EVENTS.map((entry) => entry.group)).toEqual(
      WEBHOOK_EVENT_GROUPS,
    );
    expect(
      SUBSCRIBABLE_WEBHOOK_EVENTS.filter((entry) => entry.events.length === 0),
    ).toEqual([]);
    expect(offered).toContain('LICENSE_FAMILY_CREATED');
    expect(offered).not.toContain('FEATURE_FLAG_EVALUATED');
    expect(offered).not.toContain('ENTITLEMENT_VALUE_GET');
    expect(offered).toHaveLength(Object.keys(WEBHOOK_EVENTS).length - 2);
  });

  it('reads an event by its type, with its audit-trail label', () => {
    const t = translatorFor(en);

    expect(getWebhookEvent('com.kaiten.license_family.v1.deleted')).toEqual({
      name: 'LICENSE_FAMILY_DELETED',
      type: 'com.kaiten.license_family.v1.deleted',
      group: 'licenseFamily',
    });
    expect(getWebhookEventLabel('com.kaiten.license_family.v1.deleted', t)).toBe(
      'License family deleted',
    );
    expect(
      getWebhookEventOptionLabel('com.kaiten.license_family.v1.deleted', t),
    ).toBe('License families – License family deleted');
    expect(
      getWebhookEventLabel('com.kaiten.feature_flag.v1.updated', translatorFor(fr)),
    ).toBe('Feature flag mis à jour');
  });

  // An event newer than the console, or a type an old subscription still
  // carries, reads as the type itself, under "Other events".
  it('reads a type this build does not know as itself', () => {
    const t = translatorFor(en);

    expect(getWebhookEvent('com.kaiten.gadget.v1.created')).toBeUndefined();
    expect(getWebhookEventLabel('com.kaiten.gadget.v1.created', t)).toBe(
      'com.kaiten.gadget.v1.created',
    );
    expect(getWebhookEventOptionLabel('CUSTOMER_CREATED', t)).toBe(
      'CUSTOMER_CREATED',
    );
    expect(getWebhookEventGroupLabel(null, t)).toBe('Other events');
  });
});
