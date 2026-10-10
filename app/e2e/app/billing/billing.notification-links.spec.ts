import type { Notification } from '@/features/notifications/types';
import { expect, test } from '../_support/app-test';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { NotificationsDriver } from '../_support/drivers/notifications.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installDashboardAppMocks } from '../_support/mocks/install-dashboard-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installNotificationAppMocks } from '../_support/mocks/install-notification-app-mocks';
import { NotificationAppModel } from '../_support/model/notification-app-model';
import { createDashboardReadModel } from '../dashboard/dashboard.scenarios';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
  INITECH_LATE_INVOICE_ID,
} from './lifecycle-world';

// The notifications of billing link where the API renders them: a subscription to the
// Billing tab of its instance, an invoice that is held to the invoice, and a held
// invoice with none named to the list of the invoices. Each lands on a screen that
// exists, never on the page that says it was not found.

const billingEvent = (
  id: string,
  event: 'canceled' | 'started' | 'status_changed',
  eventName: Notification['eventName'],
  title: string,
  actionUrl: string,
  createdAt: string,
): Notification => ({
  actionUrl,
  createdAt,
  eventName,
  eventType: `com.kaiten.instance.billing.v1.${event}`,
  id,
  objectType: 'instance',
  title,
});

const seed: Notification[] = [
  {
    actionUrl: '/invoices',
    createdAt: '2026-10-07T11:50:00.000Z',
    eventName: 'INSTANCE_INVOICE_HELD',
    eventType: 'com.kaiten.instance.invoice.v1.held',
    id: 'ntf-billing-005',
    objectType: 'instance',
    title: 'An invoice is held',
  },
  {
    actionUrl: `/invoices/${INITECH_LATE_INVOICE_ID}`,
    body: 'Its usage journal failed a check: LEDGER_SEQUENCE_GAP',
    createdAt: '2026-10-07T11:40:00.000Z',
    eventName: 'INSTANCE_INVOICE_HELD',
    eventType: 'com.kaiten.instance.invoice.v1.held',
    id: 'ntf-billing-004',
    objectType: 'instance',
    title: 'An invoice of initech-late is held',
  },
  billingEvent(
    'ntf-billing-003',
    'canceled',
    'INSTANCE_BILLING_CANCELED',
    "hooli-prod's subscription was canceled",
    '/customers/instances/hooli-prod/billing',
    '2026-10-07T11:30:00.000Z',
  ),
  billingEvent(
    'ntf-billing-002',
    'status_changed',
    'INSTANCE_BILLING_STATUS_CHANGED',
    "initech-late's subscription changed status",
    '/customers/instances/initech-late/billing',
    '2026-10-07T11:20:00.000Z',
  ),
  billingEvent(
    'ntf-billing-001',
    'started',
    'INSTANCE_BILLING_STARTED',
    "initech-prod's subscription started",
    '/customers/instances/initech-prod/billing',
    '2026-10-07T11:10:00.000Z',
  ),
];

test.describe('the notifications of billing', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-07T12:00:00.000Z'));
    await installDashboardAppMocks(page, createDashboardReadModel());
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await installNotificationAppMocks(
      page,
      new NotificationAppModel({ notifications: seed }),
    );
  });

  test('a subscription started leads to the Billing tab of its instance', async ({
    page,
  }) => {
    const notifications = new NotificationsDriver(page);
    await page.goto('/dashboard');
    await notifications.openPanel();

    await notifications
      .panelItem("initech-prod's subscription started")
      .click();

    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-prod\/billing$/,
    );
    await expect(new InstanceBillingDriver(page).tab()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      new InstanceBillingDriver(page).subscriptionCard(),
    ).toContainText('Active');
    await expect(page.getByText('Page not found')).toHaveCount(0);
  });

  test('a subscription that changed status leads to the tab that says why', async ({
    page,
  }) => {
    const notifications = new NotificationsDriver(page);
    await page.goto('/dashboard');
    await notifications.openPanel();

    await notifications
      .panelItem("initech-late's subscription changed status")
      .click();

    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-late\/billing$/,
    );
    await expect(
      new InstanceLifecycleDriver(page).pastDueNotice(),
    ).toContainText('Past due since Sep 1, 2026 (UTC)');
  });

  test('a subscription that was canceled leads to the tab that says it ended', async ({
    page,
  }) => {
    const notifications = new NotificationsDriver(page);
    await page.goto('/dashboard');
    await notifications.openPanel();

    await notifications
      .panelItem("hooli-prod's subscription was canceled")
      .click();

    await expect(page).toHaveURL(
      /\/customers\/instances\/hooli-prod\/billing$/,
    );
    await expect(
      new InstanceBillingDriver(page).subscriptionCard(),
    ).toContainText('Canceled');
  });

  test('an invoice that is held leads to the invoice', async ({ page }) => {
    const notifications = new NotificationsDriver(page);
    await page.goto('/dashboard');
    await notifications.openPanel();

    await notifications.panelItem('An invoice of initech-late is held').click();

    await expect(page).toHaveURL(
      new RegExp(`/invoices/${INITECH_LATE_INVOICE_ID}$`),
    );
    await expect(new InvoiceDetailDriver(page).title()).toContainText(
      'Activation invoice',
    );
    await expect(page.getByText('Page not found')).toHaveCount(0);
  });

  test('a held invoice that names none leads to the list of the invoices', async ({
    page,
  }) => {
    const notifications = new NotificationsDriver(page);
    await page.goto('/dashboard');
    await notifications.openPanel();

    await notifications.panelItem('An invoice is held').click();

    await expect(page).toHaveURL(/\/invoices$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Invoices' }),
    ).toBeVisible();
    await expect(page.getByText('Page not found')).toHaveCount(0);
  });

  test('the preferences list the events of billing under a group of their own, with the icon of billing', async ({
    page,
  }) => {
    const notifications = new NotificationsDriver(page);

    await notifications.gotoPreferences();

    const group = notifications.preferenceGroup('Billing');
    await expect(group).toBeVisible();
    // The icon of the data model of billing, the one of its navigation.
    await expect(group.locator('svg.lucide-receipt')).toBeVisible();
    for (const label of [
      'Subscription started',
      'Subscription status changed',
      'Subscription canceled',
      'Invoice held',
    ]) {
      await expect(notifications.preferenceSwitch(label)).toBeVisible();
    }
  });
});
