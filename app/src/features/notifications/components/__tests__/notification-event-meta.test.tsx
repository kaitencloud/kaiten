import { render } from '@testing-library/react';
import { Bell } from 'lucide-react';
import { describe, expect, it } from 'vite-plus/test';
import * as zod from '@/api-client/zod.gen';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { KaitenEventName, Notification } from '../../types';
import { getNotificationEventMeta } from '../notification-event-meta';
import { NotificationRow } from '../notification-row';

// The `billing` group of the notification catalogue
// (api/internal/modules/notifications/catalogue/entries.go): the events that
// notify by default, then those that only appear in the settings. Typed with the
// contract's union, so a name that leaves it fails the type check.
const BILLING_EVENTS = [
  'INSTANCE_BILLING_STARTED',
  'INSTANCE_BILLING_STATUS_CHANGED',
  'INSTANCE_BILLING_CANCELED',
  'INSTANCE_INVOICE_HELD',
  'INSTANCE_INVOICE_PUSH_FAILED',
  'INSTANCE_INVOICE_PAYMENT_FAILED',
  'INSTANCE_INVOICE_RECONCILIATION_MISMATCH',
  'CUSTOMER_PAYMENT_METHOD_EXPIRING',
  'BILLING_PROVIDER_SYNC_FAILED',
  'VOUCHER_EXHAUSTED',
  'BILLING_PROVIDER_DISCONNECTED',
  'INSTANCE_BILLING_CANCELLATION_SCHEDULED',
  'INSTANCE_BILLING_CANCELLATION_REVERTED',
  'INSTANCE_BILLING_PLAN_CHANGE_SCHEDULED',
  'INSTANCE_BILLING_PLAN_CHANGE_CANCELLED',
  'INSTANCE_BILLING_PLAN_CHANGED',
  'INSTANCE_BILLING_PROVIDER_CHANGED',
  'INSTANCE_INVOICE_ISSUED',
  'INSTANCE_INVOICE_RELEASED',
  'INSTANCE_INVOICE_PUSHED',
  'INSTANCE_INVOICE_PAID',
  'INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE',
  'INSTANCE_INVOICE_VOIDED',
  'INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED',
  'CUSTOMER_PAYMENT_METHOD_ATTACHED',
  'CUSTOMER_PAYMENT_METHOD_DETACHED',
  'BILLING_PROVIDER_CONNECTED',
  'INSTANCE_ADDON_ADDED',
  'INSTANCE_ADDON_QUANTITY_CHANGED',
  'INSTANCE_ADDON_REMOVED',
  'VOUCHER_EXPIRED',
  'INSTANCE_VOUCHER_REDEEMED',
  'INSTANCE_VOUCHER_REVOKED',
  'INSTANCE_VOUCHER_EXPIRED',
  'PUBLISHABLE_KEY_CREATED',
  'PUBLISHABLE_KEY_REVOKED',
] as const satisfies readonly KaitenEventName[];

const DESTRUCTIVE: readonly KaitenEventName[] = [
  'BILLING_PROVIDER_DISCONNECTED',
  'INSTANCE_INVOICE_PAYMENT_FAILED',
  'INSTANCE_INVOICE_PUSH_FAILED',
];
const WARNING: readonly KaitenEventName[] = [
  'BILLING_PROVIDER_SYNC_FAILED',
  'CUSTOMER_PAYMENT_METHOD_EXPIRING',
  'INSTANCE_INVOICE_HELD',
  'INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE',
  'INSTANCE_INVOICE_RECONCILIATION_MISMATCH',
];

// Events of the contract that look like billing's and that the catalogue does not
// notify: the changes to a voucher that its own authors make.
const NOT_NOTIFIED: readonly string[] = [
  'VOUCHER_ARCHIVED',
  'VOUCHER_CREATED',
  'VOUCHER_PUBLISHED',
  'VOUCHER_UPDATED',
];
const LOOKS_LIKE_BILLING =
  /^(BILLING_|CUSTOMER_PAYMENT_METHOD_|INSTANCE_ADDON_|INSTANCE_BILLING_|INSTANCE_INVOICE_|INSTANCE_VOUCHER_|PUBLISHABLE_KEY_|VOUCHER_)/;

/** Every event name the OpenAPI document declares, read from its generated schemas. */
function contractEventNames(): string[] {
  return Object.entries(zod).flatMap(([key, schema]) => {
    if (!/^zOn\w+WebhookRequest$/.test(key)) {
      return [];
    }
    const { options } = (
      schema as unknown as {
        shape: { body: { shape: { name: { options: string[] } } } };
      }
    ).shape.body.shape.name;

    return options;
  });
}

describe('the icons of the billing events', () => {
  it('lists the 36 events of the billing group of the catalogue', () => {
    expect(new Set(BILLING_EVENTS).size).toBe(36);
  });

  it.each(BILLING_EVENTS)('gives %s an icon of its own, not the bell', (name) => {
    expect(getNotificationEventMeta(name).Icon).not.toBe(Bell);
  });

  it('knows every billing event of the contract, or says the catalogue leaves it out', () => {
    const names = contractEventNames();
    // The read itself works: the events of the group are in the contract.
    expect(names).toEqual(expect.arrayContaining([...BILLING_EVENTS]));

    const unknown = names.filter(
      (name) =>
        LOOKS_LIKE_BILLING.test(name) &&
        !(BILLING_EVENTS as readonly string[]).includes(name) &&
        !NOT_NOTIFIED.includes(name),
    );

    expect(unknown).toEqual([]);
  });

  it.each(DESTRUCTIVE)('flags %s as destructive', (name) => {
    expect(getNotificationEventMeta(name).tone).toBe('destructive');
  });

  it.each(WARNING)('flags %s as a warning', (name) => {
    expect(getNotificationEventMeta(name).tone).toBe('warning');
  });

  it('leaves the other billing events with the default tone', () => {
    const others = BILLING_EVENTS.filter(
      (name) =>
        !DESTRUCTIVE.includes(name) && !WARNING.includes(name),
    );

    expect(others).toHaveLength(36 - DESTRUCTIVE.length - WARNING.length);
    for (const name of others) {
      expect(getNotificationEventMeta(name).tone, name).toBe('default');
    }
  });

  it('draws what belongs to an entity with the icon of that entity', () => {
    expect(getNotificationEventMeta('INSTANCE_INVOICE_PAID').Icon).toBe(
      dataModelIcons.invoice,
    );
    expect(getNotificationEventMeta('INSTANCE_ADDON_ADDED').Icon).toBe(
      dataModelIcons.addon,
    );
    expect(getNotificationEventMeta('VOUCHER_EXPIRED').Icon).toBe(
      dataModelIcons.voucher,
    );
    expect(getNotificationEventMeta('PUBLISHABLE_KEY_CREATED').Icon).toBe(
      dataModelIcons.publishableKey,
    );
    expect(
      getNotificationEventMeta('CUSTOMER_PAYMENT_METHOD_ATTACHED').Icon,
    ).toBe(dataModelIcons.customer);
    expect(getNotificationEventMeta('INSTANCE_BILLING_PLAN_CHANGED').Icon).toBe(
      dataModelIcons.instance,
    );
  });

  it('keeps the bell for an event this build does not know', () => {
    const meta = getNotificationEventMeta('SOMETHING_NEW');

    expect(meta.Icon).toBe(Bell);
    expect(meta.tone).toBe('default');
  });
});

describe('a billing notification in the feed', () => {
  const notification = (eventName: KaitenEventName): Notification => ({
    actionUrl: '/invoices/inv-1',
    createdAt: '2026-10-07T11:40:00.000Z',
    eventName,
    eventType: 'com.kaiten.instance.invoice.v1.payment_failed',
    id: 'ntf-1',
    objectType: 'instance',
    title: 'The payment of an invoice of acme-us failed',
  });

  it('draws a failed payment with its icon on a destructive circle', () => {
    const { container } = render(
      <NotificationRow
        notification={notification('INSTANCE_INVOICE_PAYMENT_FAILED')}
        onSelect={() => {}}
      />,
    );

    const circle = container.querySelector('span.rounded-full');

    expect(circle).toHaveClass('bg-destructive/10');
    expect(circle?.querySelector('svg')).toHaveClass('lucide-circle-x');
  });

  it('draws a paid invoice with the icon of the invoice, in the default tone', () => {
    const { container } = render(
      <NotificationRow
        notification={notification('INSTANCE_INVOICE_PAID')}
        onSelect={() => {}}
      />,
    );

    const circle = container.querySelector('span.rounded-full');

    expect(circle).toHaveClass('bg-primary/10');
    expect(circle?.querySelector('svg')).toHaveClass('lucide-receipt-text');
  });
});
