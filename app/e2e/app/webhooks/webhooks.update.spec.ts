import {
  expect,
  expectErrorToast,
  expectToast,
  recordWrites,
  test,
} from '../_support/app-test';
import { WebhooksFormDriver } from '../_support/drivers/webhooks-form.driver';
import { WebhooksListDriver } from '../_support/drivers/webhooks-list.driver';
import { updateMswMocks } from '../_support/mocks/install-app-mocks';
import { installWebhooksAppMocks } from '../_support/mocks/install-webhooks-app-mocks';
import {
  createWebhooksFormModel,
  createWebhookWithOtherEventsModel,
  createWebhookWithoutFilterModel,
} from './webhooks.scenarios';

// Editing a webhook: the page opens on what the webhook holds, Save stays off
// until something really changed, the PUT carries the URL and the events, and
// a change made elsewhere meanwhile is kept, or refused when the webhook is gone.

const CRM_URL = 'https://crm.example.com/hooks/kaiten';

test.describe('editing a webhook', () => {
  test('opens from the Edit action, filled in, named by its host', async ({
    page,
  }) => {
    await installWebhooksAppMocks(page, createWebhooksFormModel());
    const list = new WebhooksListDriver(page);
    const form = new WebhooksFormDriver(page);

    await list.gotoList();
    await expect(list.editRow(CRM_URL)).toHaveAccessibleName(
      'Edit webhook crm.example.com',
    );
    await list.editRow(CRM_URL).click();

    await expect(page).toHaveURL(
      /\/integrations\/webhooks\/ep_customers\/edit$/,
    );
    await expect(form.heading()).toHaveText('Edit Webhook');
    await expect(form.url()).toHaveValue(CRM_URL);
    await expect(form.selectionCount()).toHaveText('2 events selected');
    await expect(form.chip('CUSTOMER_CREATED')).toBeVisible();
    await expect(form.chip('CUSTOMER_UPDATED')).toBeVisible();
    await expect(form.submitButton()).toHaveText('Save');
    await expect(form.submitButton()).toBeDisabled();

    // The trail and the tab name the webhook by its host, never its URL.
    const trail = page.getByRole('navigation', { name: 'breadcrumb' });
    await expect(trail).toContainText('Webhooks');
    await expect(trail).toContainText('crm.example.com');
    await expect(trail).toContainText('Edit');
    await expect(trail).not.toContainText('/hooks/kaiten');
    await expect(page).toHaveTitle(/crm\.example\.com/);
    expect(await page.title()).not.toContain('/hooks/kaiten');
  });

  test('keeps Save off until something changed, and again once it is put back', async ({
    page,
  }) => {
    await installWebhooksAppMocks(page, createWebhooksFormModel());
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_customers');

    await form.openGroup('Customers');
    await form.row('Customer created').click();
    await expect(form.submitButton()).toBeEnabled();

    await form.row('Customer created').click();
    await expect(form.selectionCount()).toHaveText('2 events selected');
    await expect(form.submitButton()).toBeDisabled();
  });

  test('sends the URL and the events, lists the change and keeps the secret', async ({
    page,
  }) => {
    await installWebhooksAppMocks(page, createWebhooksFormModel());
    const list = new WebhooksListDriver(page);
    const form = new WebhooksFormDriver(page);
    await list.gotoList();
    await list.revealSecret(CRM_URL);
    await expect(list.row(CRM_URL)).toContainText('whsec_mock_ep_customers');
    const writes = recordWrites(page, /^\/api\/webhooks/);

    await list.editRow(CRM_URL).click();
    await form.openGroup('Customers');
    await form.row('Customer deleted').click();
    await form.submit();

    await expectToast(page, 'Webhook updated');
    await expect(page).toHaveURL(/\/integrations\/webhooks$/);
    // The events in catalogue order, whatever order they were ticked in.
    expect(writes).toEqual([
      {
        body: {
          eventTypes: [
            'com.kaiten.customer.v1.created',
            'com.kaiten.customer.v1.deleted',
            'com.kaiten.customer.v1.updated',
          ],
          url: CRM_URL,
        },
        method: 'PUT',
        pathname: '/api/webhooks/ep_customers',
      },
    ]);
    await expect(list.row(CRM_URL)).toContainText('CUSTOMER_DELETED');
    await list.revealSecret(CRM_URL);
    await expect(list.row(CRM_URL)).toContainText('whsec_mock_ep_customers');
  });

  test('keeps a URL changed elsewhere while only the events were edited here', async ({
    page,
  }) => {
    const model = createWebhooksFormModel();
    await installWebhooksAppMocks(page, model);
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_customers');
    const writes = recordWrites(page, /^\/api\/webhooks/);

    model.mutateExternally('ep_customers', {
      url: 'https://crm.example.com/hooks/v2',
    });
    await updateMswMocks(page, 'webhooks', model);
    await form.openGroup('Customers');
    await form.row('Customer deleted').click();
    await form.submit();

    await expectToast(page, 'Webhook updated');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body).toEqual({
      eventTypes: [
        'com.kaiten.customer.v1.created',
        'com.kaiten.customer.v1.deleted',
        'com.kaiten.customer.v1.updated',
      ],
      url: 'https://crm.example.com/hooks/v2',
    });
  });

  test('refuses to save a webhook deleted meanwhile, and the list forgets it', async ({
    page,
  }) => {
    const model = createWebhooksFormModel();
    await installWebhooksAppMocks(page, model);
    const list = new WebhooksListDriver(page);
    const form = new WebhooksFormDriver(page);
    await list.gotoList();
    await list.editRow(CRM_URL).click();
    await expect(form.heading()).toHaveText('Edit Webhook');
    const writes = recordWrites(page, /^\/api\/webhooks/);

    model.mutateExternally('ep_customers', null);
    await updateMswMocks(page, 'webhooks', model);
    await form.openGroup('Customers');
    await form.row('Customer deleted').click();
    await form.submit();

    await expectErrorToast(page, 'The webhook does not exist.');
    expect(writes).toEqual([]);
    await expect(page).toHaveURL(/\/ep_customers\/edit$/);

    await form.cancel();
    await list.expectLoaded();
    await expect(list.rows()).toHaveCount(2);
    await expect(list.row(CRM_URL)).toHaveCount(0);
  });
});

test.describe('editing a webhook that holds events the picker does not offer', () => {
  test.beforeEach(async ({ page }) => {
    await installWebhooksAppMocks(page, createWebhookWithOtherEventsModel());
  });

  test('keeps them unless they are unticked', async ({ page }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_other_events');
    const writes = recordWrites(page, /^\/api\/webhooks/);

    await expect(form.selectionCount()).toHaveText('3 events selected');
    await form.openGroup('Other events');
    await expect(form.row('Feature flag evaluated')).toBeChecked();
    await expect(form.row('com.kaiten.future_object.v1.created')).toBeChecked();

    await form.openGroup('Customers');
    await form.row('Customer updated').click();
    await form.submit();

    await expectToast(page, 'Webhook updated');
    expect(writes[0]?.body).toEqual({
      eventTypes: [
        'com.kaiten.customer.v1.created',
        'com.kaiten.customer.v1.updated',
        'com.kaiten.feature_flag.v1.evaluated',
        'com.kaiten.future_object.v1.created',
      ],
      url: 'https://hooks.example.com/other',
    });
  });

  test('drops one once it is unticked', async ({ page }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_other_events');
    const writes = recordWrites(page, /^\/api\/webhooks/);

    await form.openGroup('Other events');
    await form.row('com.kaiten.future_object.v1.created').click();
    await form.submit();

    await expectToast(page, 'Webhook updated');
    expect(writes[0]?.body).toEqual({
      eventTypes: [
        'com.kaiten.customer.v1.created',
        'com.kaiten.feature_flag.v1.evaluated',
      ],
      url: 'https://hooks.example.com/other',
    });
  });
});

test.describe('editing a webhook that has no event filter', () => {
  const EVERYTHING_URL = 'https://hooks.example.com/everything';

  test.beforeEach(async ({ page }) => {
    await installWebhooksAppMocks(page, createWebhookWithoutFilterModel());
  });

  test('keeps it receiving every event while only its URL changes', async ({
    page,
  }) => {
    const list = new WebhooksListDriver(page);
    const form = new WebhooksFormDriver(page);
    await list.gotoList();
    await expect(list.row(EVERYTHING_URL)).toContainText('Every event');
    await form.gotoEdit('ep_no_filter');
    const writes = recordWrites(page, /^\/api\/webhooks/);

    await expect(form.keepEveryEvent()).toBeChecked();
    await expect(form.picker()).toHaveCount(0);
    await expect(form.narrowingNotice()).toHaveCount(0);
    await expect(form.selectionCount()).toHaveText('Every event');
    await expect(form.submitButton()).toBeDisabled();

    await form.fillUrl(`${EVERYTHING_URL}/v2`);
    await form.submit();

    await expectToast(page, 'Webhook updated');
    // An empty eventTypes asks saas-api to keep the webhook without a filter.
    expect(writes).toEqual([
      {
        body: { eventTypes: [], url: `${EVERYTHING_URL}/v2` },
        method: 'PUT',
        pathname: '/api/webhooks/ep_no_filter',
      },
    ]);
    await expect(list.row(`${EVERYTHING_URL}/v2`)).toContainText('Every event');

    await form.gotoEdit('ep_no_filter');
    await expect(form.keepEveryEvent()).toBeChecked();
  });

  test('unticked, warns that saving is for good, needs an event, then narrows it', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_no_filter');
    const writes = recordWrites(page, /^\/api\/webhooks/);

    await form.keepEveryEvent().click();
    await expect(form.narrowingNotice()).toBeVisible();
    await expect(form.picker()).toBeVisible();
    await expect(form.selectionCount()).toHaveText('0 events selected');
    await expect(form.submitButton()).toBeDisabled();

    // Ticked again with nothing else changed: nothing to save.
    await form.keepEveryEvent().click();
    await expect(form.picker()).toHaveCount(0);
    await expect(form.submitButton()).toBeDisabled();

    await form.keepEveryEvent().click();
    await form.openGroup('Customers');
    await form.row('Customer created').click();
    await expect(form.selectionCount()).toHaveText('1 event selected');
    await form.submit();

    await expectToast(page, 'Webhook updated');
    expect(writes).toEqual([
      {
        body: {
          eventTypes: ['com.kaiten.customer.v1.created'],
          url: EVERYTHING_URL,
        },
        method: 'PUT',
        pathname: '/api/webhooks/ep_no_filter',
      },
    ]);

    // Filtered now, for good: its edit page no longer offers every event.
    await form.gotoEdit('ep_no_filter');
    await expect(form.selectionCount()).toHaveText('1 event selected');
    await expect(form.keepEveryEvent()).toHaveCount(0);
  });
});
