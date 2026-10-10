import { expect, recordWrites, test } from '../_support/app-test';
import { expectToast } from '../_support/assertions/toast';
import { BillingSettingsDriver } from '../_support/drivers/billing-settings.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { createBilledInstancesModel } from '../instances/instances.scenarios';
import {
  createBillingDisabledModel,
  createBillingFullModel,
  createSubscriptionsModel,
} from './billing.scenarios';

// The settings of billing, where an organization says who collects its invoices,
// what a subscription takes when it names nothing of its own, and reads how long
// usage is kept. NoOp is always there and has nothing to connect; what a release
// has not shipped is hidden or listed as unavailable, and never offered.

const SETTINGS_WRITES = /\/billing\/settings$/;

test.describe('the billing settings', () => {
  test('say that nobody collects the invoices but the organization, with nothing to connect', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.goto();

    const noop = page.getByTestId('billing-provider-noop');
    await expect(noop).toContainText('Manual hand-off');
    await expect(noop).toContainText('Nothing to connect.');
    await expect(noop).toContainText('Available');
    await expect(
      noop.getByRole('link', { name: 'Open the handoff queue' }),
    ).toHaveAttribute('href', '/invoices?view=waiting');
    // Stripe is not shipped here: it is not listed as a provider to connect.
    await expect(page.getByTestId('billing-provider-stripe')).toHaveCount(0);
    await expect(settings.handoffStripeInvoicesField()).toHaveCount(0);
  });

  test('show the defaults of the organization, and list charging automatically as needing a provider', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.goto();

    await expect(settings.daysField()).toHaveValue('30');
    await expect(settings.collectionMethod()).toContainText('Send the invoice');
    await settings.collectionMethod().click();
    await expect(
      page.getByRole('option', {
        name: 'Charge automatically (needs a payment provider)',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(settings.saveButton()).toBeDisabled();
  });

  test('keep the three defaults together when one is saved, and say they apply from now on', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const writes = recordWrites(page, SETTINGS_WRITES, ['PUT']);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.goto();
    await expect(settings.defaults()).toContainText(
      'an invoice already issued keeps the terms it was issued with',
    );
    await settings.daysField().fill('45');
    await settings.saveButton().click();

    await expectToast(page, 'Billing defaults saved');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toEqual({
      defaultCollectionMethod: 'SEND_INVOICE',
      defaultDaysUntilDue: 45,
      handoffStripeInvoices: false,
    });
    // The form opens again on what was kept: nothing left to save.
    await expect(settings.daysField()).toHaveValue('45');
    await expect(settings.saveButton()).toBeDisabled();
  });

  test('reach the dialog that subscribes an instance, which says the terms of the organization', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await settings.goto();
    await settings.daysField().fill('45');
    await settings.saveButton().click();
    await expectToast(page, 'Billing defaults saved');

    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await expect(billing.daysUntilDueField()).toHaveAttribute(
      'placeholder',
      'Organization default: 45',
    );
  });

  test('refuse a number of days of more than a year, or none, in words and before anything is sent', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const writes = recordWrites(page, SETTINGS_WRITES, ['PUT']);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.goto();
    await settings.daysField().fill('366');
    await settings.daysField().blur();

    // What was typed stays, and the field says what is wrong with it.
    await expect(settings.daysField()).toHaveValue('366');
    await expect(
      page.getByText('Enter a whole number of days, from 0 to 365'),
    ).toBeVisible();
    await expect(settings.saveButton()).toBeDisabled();

    await settings.daysField().fill('365');

    await expect(
      page.getByText('Enter a whole number of days, from 0 to 365'),
    ).toHaveCount(0);
    await expect(settings.saveButton()).toBeEnabled();

    await settings.daysField().fill('');
    await settings.daysField().blur();

    await expect(
      page.getByText('Enter a whole number of days, from 0 to 365'),
    ).toBeVisible();
    await expect(settings.saveButton()).toBeDisabled();
    expect(writes).toHaveLength(0);
  });

  test('show a refusal of the API on the field it is about, and take it back when the number changes', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createSubscriptionsModel();
    model.subscriptions.armProblem('updateBillingSettings', {
      code: 'UpdateBillingSettings.InvalidDaysUntilDue',
      detail: 'defaultDaysUntilDue is between 0 and 365',
      status: 422,
    });
    await installBillingAppMocks(page, model);

    await settings.goto();
    await settings.daysField().fill('60');
    await settings.saveButton().click();

    await expect(
      settings.defaults().getByText('defaultDaysUntilDue is between 0 and 365'),
    ).toBeVisible();
    // What was typed stays, and the person is not told it was lost.
    await expect(settings.daysField()).toHaveValue('60');

    await settings.daysField().fill('61');

    await expect(
      settings.defaults().getByText('defaultDaysUntilDue is between 0 and 365'),
    ).toHaveCount(0);
    await settings.saveButton().click();
    await expectToast(page, 'Billing defaults saved');
  });

  test('show a refusal that is about no field above the button, with a way to send again', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createSubscriptionsModel();
    model.subscriptions.armProblem('updateBillingSettings', {
      code: 'Billing.EntitlementCheckUnavailable',
      detail: 'The billing entitlement could not be checked',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await settings.goto();
    await settings.daysField().fill('60');
    await settings.saveButton().click();

    const alert = settings
      .defaults()
      .getByText('The billing entitlement could not be checked');
    await expect(alert).toBeVisible();
    await settings.defaults().getByRole('button', { name: 'Retry' }).click();

    await expectToast(page, 'Billing defaults saved');
    await expect(alert).toHaveCount(0);
  });

  test('show a refusal to read them, with a way to ask again, and keep the other cards', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createSubscriptionsModel();
    model.subscriptions.armProblem('getBillingSettings', {
      code: 'Billing.EntitlementCheckUnavailable',
      detail: 'The billing entitlement could not be checked',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await page.goto('/settings/billing');

    await expect(settings.loadError()).toContainText(
      'The billing entitlement could not be checked',
    );
    await expect(settings.providers()).toBeVisible();
    await expect(settings.retention()).toBeVisible();
    await settings.loadError().getByRole('button', { name: 'Retry' }).click();

    await expect(settings.defaults()).toBeVisible();
    await expect(settings.daysField()).toHaveValue('30');
  });

  test('can be read and not changed by a session that may only read billing', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.goto();

    await expect(settings.readOnlyNotice()).toContainText(
      'Your session can read these defaults but not change them.',
    );
    await expect(settings.daysField()).toBeDisabled();
    await expect(settings.saveButton()).toHaveCount(0);
  });

  test('say how long usage is kept, and how long a repeated report is ignored, without anything to edit', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.goto();

    await expect(settings.retention()).toContainText(
      'Usage reports are kept for 18 months.',
    );
    await expect(settings.retention()).toContainText(
      'A report sent again with the same transaction id is ignored for 35 days.',
    );
    await expect(settings.retention().getByRole('textbox')).toHaveCount(0);
  });
});

test.describe('the billing settings of a release that ships a payment provider', () => {
  test('list Stripe with its state, keep charging automatically for the contracts and offer to hand off its invoices', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(page, createBillingFullModel());

    await settings.goto();

    await expect(page.getByTestId('billing-provider-stripe')).toContainText(
      'Connected',
    );
    await expect(settings.handoffStripeInvoicesField()).toBeVisible();
    await settings.collectionMethod().click();
    await expect(
      page.getByRole('option', {
        name: 'Charge automatically (set on each contract)',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('the billing settings where billing is not there', () => {
  test('are not linked from the settings of the organization where billing is off', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await settings.gotoSettings();

    await expect(settings.linkCard()).toHaveCount(0);
  });

  test('explain themselves at their own address instead of failing', async ({
    page,
  }) => {
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await page.goto('/settings/billing');

    await expect(page.getByTestId('billing-unavailable')).toContainText(
      'Billing is not enabled',
    );
  });

  test('are linked from the settings of the organization where billing is on', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.gotoSettings();
    await settings.linkCard().click();

    await expect(page).toHaveURL(/\/settings\/billing$/);
    await expect(settings.defaults()).toBeVisible();
  });
});
