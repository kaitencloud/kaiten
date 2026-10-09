import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { Notification } from '../../types';
import { NotificationItem } from '../notification-item';
import { NotificationRow } from '../notification-row';

const meta = {
  title: 'Features/Notifications/BillingEvents',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const at = '2026-10-07T11:00:00.000Z';

// One notification of each tone the billing group draws, and of the entities it
// draws with their own icon: what failed is destructive, what may be wrong is a
// warning, and the routine news is in the default tone.
const NOTIFICATIONS: Notification[] = [
  {
    actionUrl: '/invoices/inv-acme-us-renewal-4',
    createdAt: at,
    eventName: 'INSTANCE_INVOICE_PUSH_FAILED',
    eventType: 'com.kaiten.instance.invoice.v1.push_failed',
    id: 'ntf-push-failed',
    objectType: 'instance',
    title: 'An invoice of acme-us could not be pushed to its payment provider',
  },
  {
    actionUrl: '/invoices/inv-acme-us-renewal-2',
    createdAt: at,
    eventName: 'INSTANCE_INVOICE_RECONCILIATION_MISMATCH',
    eventType: 'com.kaiten.instance.invoice.v1.reconciliation_mismatch',
    id: 'ntf-mismatch',
    objectType: 'instance',
    title: 'An invoice of acme-us differs in its payment provider',
  },
  {
    actionUrl: '/settings/billing',
    createdAt: at,
    eventName: 'BILLING_PROVIDER_DISCONNECTED',
    eventType: 'com.kaiten.billing.provider.v1.disconnected',
    id: 'ntf-disconnected',
    objectType: 'billing',
    title: 'Stripe was disconnected: its invoices are no longer pushed',
  },
  {
    actionUrl: '/customers/globex',
    createdAt: at,
    eventName: 'CUSTOMER_PAYMENT_METHOD_EXPIRING',
    eventType: 'com.kaiten.customer.payment_method.v1.expiring',
    id: 'ntf-expiring',
    objectType: 'customer',
    title: "Globex's payment method expires soon",
  },
  {
    actionUrl: '/invoices/inv-acme-us-renewal-1',
    createdAt: at,
    eventName: 'INSTANCE_INVOICE_PAID',
    eventType: 'com.kaiten.instance.invoice.v1.paid',
    id: 'ntf-paid',
    objectType: 'instance',
    readAt: at,
    title: 'An invoice of acme-us was paid',
  },
  {
    actionUrl: '/customers/instances/acme-us/billing',
    createdAt: at,
    eventName: 'INSTANCE_ADDON_ADDED',
    eventType: 'com.kaiten.instance.addon.v1.added',
    id: 'ntf-addon',
    objectType: 'instance',
    readAt: at,
    title: 'An add-on was added to acme-us',
  },
];

// The feed page: a row for each, with the icon of the event in a circle of its tone.
export const FeedRows: Story = {
  render: () => (
    <div className="space-y-1">
      {NOTIFICATIONS.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          onSelect={() => {}}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const { title } of NOTIFICATIONS) {
      // A row is drawn for a wide screen and for a narrow one: the wide one comes first.
      await expect(canvas.getAllByText(title)[0]).toBeVisible();
    }
    const circles = canvasElement.querySelectorAll('span.rounded-full');
    await expect(
      [...circles].map((circle) => circle.className.match(/bg-\w+(?=\/)/)?.[0]),
    ).toEqual(
      expect.arrayContaining(['bg-destructive', 'bg-warning', 'bg-primary']),
    );
  },
};

// The panel of the bell: the same icons and tones, one entry for each.
export const BellPanelItems: Story = {
  render: () => (
    <div className="w-96 space-y-1">
      {NOTIFICATIONS.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onSelect={() => {}}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const { title } of NOTIFICATIONS) {
      await expect(canvas.getByText(title)).toBeVisible();
    }
  },
};
