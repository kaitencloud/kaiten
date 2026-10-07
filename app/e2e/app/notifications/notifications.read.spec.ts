import { expect, test } from '../_support/app-test';
import { NotificationsDriver } from '../_support/drivers/notifications.driver';
import { installEmptyWebhooksStub } from '../_support/mocks/install-integration-stubs';
import { installNotificationAppMocks } from '../_support/mocks/install-notification-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installDashboardAppMocks } from '../_support/mocks/install-dashboard-app-mocks';
import { createCustomersListModel } from '../customers/customers.scenarios';
import { createInstancesListModel } from '../instances/instances.scenarios';
import { createDashboardReadModel } from '../dashboard/dashboard.scenarios';
import {
  createMixedObjectsFeedModel,
  createNotificationsFeedModel,
} from './notifications.scenarios';

test.describe('notifications read', () => {
  test.beforeEach(async ({ page }) => {
    await installDashboardAppMocks(page, createDashboardReadModel());
    await installCustomerAppMocks(page, createCustomersListModel());
    await installInstanceAppMocks(page, createInstancesListModel());
  });

  test('bell shows the unread count and the panel lists notifications', async ({
    page,
  }) => {
    const model = createNotificationsFeedModel();
    const notifications = new NotificationsDriver(page);

    await installNotificationAppMocks(page, model);
    await page.goto('/dashboard');

    await notifications.expectBellUnreadCount(3);

    await notifications.openPanel();
    await expect(
      notifications.panelItem('Acme Production is close to its Webhooks limit'),
    ).toBeVisible();
    await expect(
      notifications.panelItem('Deployment of acme-prod succeeded'),
    ).toBeVisible();
  });

  test('opening a notification marks it read and follows its action URL', async ({
    page,
  }) => {
    const model = createNotificationsFeedModel();
    const notifications = new NotificationsDriver(page);

    // A webhook delivery only fails where Kaiten Cloud serves webhooks; where
    // it does not, the link would land on the not-found page.
    await installEmptyWebhooksStub(page);
    await installNotificationAppMocks(page, model);
    await page.goto('/dashboard');

    await notifications.openPanel();
    await notifications
      .panelItem('Webhook delivery to api.example.com failed')
      .click();

    await expect(page).toHaveURL(/\/integrations\/webhooks\/history/);
    await expect(page.getByText('Page not found')).toHaveCount(0);
    await notifications.expectBellUnreadCount(2);
  });

  test('a usage notification opens the instance usage tab', async ({
    page,
  }) => {
    const model = createNotificationsFeedModel();
    const notifications = new NotificationsDriver(page);

    await installNotificationAppMocks(page, model);
    await page.goto('/dashboard');

    await notifications.openPanel();
    await notifications
      .panelItem('Acme Production is close to its Webhooks limit')
      .click();

    await expect(page).toHaveURL(
      /\/customers\/instances\/acme-production\/entitlements$/,
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Acme Production',
    );
    await expect(
      page.getByRole('tab', { name: 'Entitlements & Usage' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('a notification opened from the feed opens the object it is about', async ({
    page,
  }) => {
    const model = createNotificationsFeedModel();
    const notifications = new NotificationsDriver(page);

    await installNotificationAppMocks(page, model);
    await notifications.gotoFeed();

    await notifications.feedItem('Deployment of acme-prod succeeded').click();

    await expect(page).toHaveURL(/\/customers\/instances\/acme-production$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Acme Production',
    );
  });

  test('the object filter narrows the feed to one kind of object', async ({
    page,
  }) => {
    const model = createMixedObjectsFeedModel();
    const notifications = new NotificationsDriver(page);

    await installNotificationAppMocks(page, model);
    await notifications.gotoFeed();
    await expect(
      notifications.feedItem('Globex was added as a customer'),
    ).toBeVisible();

    await notifications.filterByObject('Instance');

    await expect(
      notifications.feedItem('Acme Production was deployed'),
    ).toBeVisible();
    await expect(
      notifications.feedItem('Globex was added as a customer'),
    ).toHaveCount(0);
    await expect(
      notifications.feedItem('Release 2.5.0 was published'),
    ).toHaveCount(0);
  });

  test('mark all as read clears the badge and the unread tab', async ({
    page,
  }) => {
    const model = createNotificationsFeedModel();
    const notifications = new NotificationsDriver(page);

    await installNotificationAppMocks(page, model);
    await notifications.gotoFeed();

    await notifications.markAllReadButton().click();

    await notifications.expectNoBellBadge();
    await notifications.unreadFilter().click();
    await expect(page.getByText('No unread notifications')).toBeVisible();
  });

  test('preferences page renders the matrix and toggles a channel', async ({
    page,
  }) => {
    const model = createNotificationsFeedModel();
    const notifications = new NotificationsDriver(page);

    await installNotificationAppMocks(page, model);
    await notifications.gotoPreferences();

    // The page has a switch per event, and one per group that sets them all.
    const instanceDeployed =
      notifications.preferenceSwitch('Instance deployed');
    await expect(instanceDeployed).toBeChecked();

    const saved = notifications.waitForPreferencesSave();
    await instanceDeployed.click();
    await expect(instanceDeployed).not.toBeChecked();

    // The switch flips before its save is sent, and the mocks only persist the
    // change once they answer it: reloading any earlier can abort the save.
    await saved;
    await page.reload();
    await expect(
      notifications.preferenceSwitch('Instance deployed'),
    ).not.toBeChecked();
  });

  test('a preferences group folds its events away and unfolds them', async ({
    page,
  }) => {
    const model = createNotificationsFeedModel();
    const notifications = new NotificationsDriver(page);

    await installNotificationAppMocks(page, model);
    await notifications.gotoPreferences();

    const group = notifications.preferenceGroup('Deployments & releases');
    const event = notifications.preferenceSwitch('Instance deployed');
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expect(event).toBeVisible();

    await group.click();
    await expect(group).toHaveAttribute('aria-expanded', 'false');
    await expect(event).toBeHidden();
    // Folded, the group can still be switched on or off as a whole.
    await expect(
      notifications.preferenceSwitch(
        'Toggle all Deployments & releases notifications',
      ),
    ).toBeVisible();

    await group.click();
    await expect(event).toBeVisible();
  });
});
