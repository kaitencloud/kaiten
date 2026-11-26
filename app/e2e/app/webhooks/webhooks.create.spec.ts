import {
  expect,
  expectErrorToast,
  expectToast,
  recordWrites,
  test,
} from '../_support/app-test';
import { WebhooksFormDriver } from '../_support/drivers/webhooks-form.driver';
import { WebhooksListDriver } from '../_support/drivers/webhooks-list.driver';
import { installWebhooksAppMocks } from '../_support/mocks/install-webhooks-app-mocks';
import { createWebhooksFormModel } from './webhooks.scenarios';

// Creating a webhook on its own page: the catalogue folded by group, a whole
// group or a preset ticked at once, a search across labels, names and types,
// the notice of a chat URL, and what reaches saas-api when the form is sent.

const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';
const SLACK_WORKFLOW_URL =
  'https://hooks.slack.com/workflows/T000/A000/000/xxxx';
const GOOGLE_CHAT_URL =
  'https://chat.googleapis.com/v1/spaces/AAAAAAAAAAA/messages?key=k&token=t';

test.describe('creating a webhook', () => {
  test.beforeEach(async ({ page }) => {
    await installWebhooksAppMocks(page, createWebhooksFormModel());
  });

  test('opens from the New Webhook link, with every group folded', async ({
    page,
  }) => {
    const list = new WebhooksListDriver(page);
    const form = new WebhooksFormDriver(page);

    await list.gotoList();
    await list.newWebhook().click();

    await expect(page).toHaveURL(/\/integrations\/webhooks\/new$/);
    await expect(form.heading()).toHaveText('New Webhook');
    await expect(form.group('Customers')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(form.rows()).toHaveCount(0);
    await expect(form.selectionCount()).toHaveText('0 events selected');
    await expect(form.submitButton()).toBeDisabled();
  });

  test('ticks a whole group from its checkbox, and shows it as one chip', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();

    await form.groupCheckbox('Customers').click();

    await expect(form.groupCheckbox('Customers')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(form.group('Customers')).toContainText('4 / 4');
    await expect(form.selectionCount()).toHaveText('4 events selected');
    await expect(form.chip('All 4 events')).toHaveCount(1);

    await form.openGroup('Customers');
    await form.row('Customer deleted').click();

    await expect(form.groupCheckbox('Customers')).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
    await expect(form.group('Customers')).toContainText('3 / 4');
    await expect(form.chip('All 4 events')).toHaveCount(0);
    await expect(form.chip('CUSTOMER_CREATED')).toBeVisible();
  });

  test('applies the Billing preset, and takes it back', async ({ page }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();

    await form.preset('Billing').click();

    await expect(form.preset('Billing')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(form.selectionCount()).toHaveText('30 events selected');
    await expect(form.groupCheckbox('Subscriptions')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await form.preset('Billing').click();

    await expect(form.preset('Billing')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(form.selectionCount()).toHaveText('0 events selected');
  });

  test('searches the catalogue, and says when nothing matches', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();

    await form.search('invoice paid');

    await expect(form.group('Invoices')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(form.rows()).toHaveCount(1);
    await expect(form.row('Invoice paid')).toBeVisible();
    await expect(form.group('Customers')).toHaveCount(0);

    await form.search('zzz');

    await expect(form.picker()).toContainText('No event matches “zzz”.');
    await form.clearSearch();
    await expect(form.searchField()).toHaveValue('');
    await expect(form.group('Customers')).toBeVisible();
  });

  test('says that a Slack or Google Chat URL receives chat messages', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();

    await form.fillUrl(SLACK_URL);
    await expect(form.chatNotice()).toContainText(
      'This is a Slack incoming webhook.',
    );

    await form.fillUrl(GOOGLE_CHAT_URL);
    await expect(form.chatNotice()).toContainText(
      'This is a Google Chat incoming webhook.',
    );

    // A Slack workflow receives the raw event: no formatting, no notice.
    await form.fillUrl(SLACK_WORKFLOW_URL);
    await expect(form.chatNotice()).toHaveCount(0);
  });

  test('sends the URL trimmed and the events in catalogue order, then lists the webhook', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    const list = new WebhooksListDriver(page);
    await form.gotoNew();
    const writes = recordWrites(page, /^\/api\/webhooks/);

    await form.fillUrl('  https://new.example.com/kaiten  ');
    await form.search('invoice paid');
    await form.row('Invoice paid').click();
    await form.clearSearch();
    await form.openGroup('Customers');
    await form.row('Customer created').click();
    await expect(form.selectionCount()).toHaveText('2 events selected');
    await form.submit();

    await expectToast(page, 'Webhook created');
    await expect(page).toHaveURL(/\/integrations\/webhooks$/);
    await expect(list.row('https://new.example.com/kaiten')).toBeVisible();
    expect(writes).toEqual([
      {
        body: {
          eventTypes: [
            'com.kaiten.customer.v1.created',
            'com.kaiten.instance.invoice.v1.paid',
          ],
          url: 'https://new.example.com/kaiten',
        },
        method: 'POST',
        pathname: '/api/webhooks',
      },
    ]);
  });

  test('goes back to the list on Cancel, and sends nothing', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    const list = new WebhooksListDriver(page);
    await form.gotoNew();
    const writes = recordWrites(page, /^\/api\/webhooks/);

    await form.fillUrl('https://new.example.com/kaiten');
    await form.cancel();

    await list.expectLoaded();
    await expect(page).toHaveURL(/\/integrations\/webhooks$/);
    await expect(list.rows()).toHaveCount(3);
    expect(writes).toEqual([]);
  });

  test('keeps the column of the URL and the actions in view while the catalogue scrolls', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();

    // About sixty events: the Selection card is as long as it gets.
    for (const preset of ['Billing', 'Instance lifecycle', 'Usage alerts']) {
      await form.preset(preset).click();
    }
    await form.groupCheckbox('Licenses').click();
    await form.groupCheckbox('Models').click();
    await form.openGroup('Licenses');
    await form.openGroup('Invoices');
    await expect(form.selectionCount()).toHaveText(/^\d+ events selected$/);

    const selectionBefore = await form.selection().boundingBox();
    const pickerBefore = await form.picker().boundingBox();
    await form.picker().hover();
    await page.mouse.wheel(0, 600);
    await expect
      .poll(async () => (await form.picker().boundingBox())?.y)
      .toBeLessThan((pickerBefore?.y ?? 0) - 300);

    const selectionAfter = await form.selection().boundingBox();
    const viewport = page.viewportSize();
    expect(
      Math.abs((selectionAfter?.y ?? 0) - (selectionBefore?.y ?? 0)),
    ).toBeLessThanOrEqual(32);
    const submit = await form.submitButton().boundingBox();
    expect(submit).not.toBeNull();
    expect((submit?.y ?? 0) + (submit?.height ?? 0)).toBeLessThanOrEqual(
      viewport?.height ?? 0,
    );
    await expect(form.submitButton()).toBeInViewport();
  });
});

test.describe('creating a webhook saas-api refuses', () => {
  test('shows the API words in a toast and keeps the form as typed', async ({
    page,
  }) => {
    const model = createWebhooksFormModel();
    model.refuseNext('createWebhook', 'svixValidation');
    await installWebhooksAppMocks(page, model);
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();

    await form.fillUrl('https://unreachable.example.com/kaiten');
    await form.groupCheckbox('Customers').click();
    await form.submit();

    await expectErrorToast(
      page,
      'The webhook URL was refused by the delivery provider.',
    );
    await expect(page).toHaveURL(/\/integrations\/webhooks\/new$/);
    await expect(form.url()).toHaveValue(
      'https://unreachable.example.com/kaiten',
    );
    await expect(form.selectionCount()).toHaveText('4 events selected');
  });
});
