import { expect, test } from '../_support/app-test';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { signInWithScopes } from '../_support/session-scopes';
import {
  createBillingDisabledModel,
  createBillingOutageModel,
  createSubscriptionsModel,
} from '../billing/billing.scenarios';
import { createBilledInstancesModel } from './instances.scenarios';

// The billing of one instance, read where the instance is: whether it is
// subscribed and how, what its next boundary will issue, and the invoices it has
// had. Where billing is not on, or the session may not read it, the tab is not
// there: absent, and not an empty tab.

test.describe('the Billing tab of an instance', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('says how a subscribed instance is billed: its status, who collects, its terms and where they come from, its price and its period', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await billing.goto('acme-production');

    const card = billing.subscriptionCard();
    await expect(card).toContainText('Active');
    await expect(card).toContainText('Manual');
    await expect(billing.row(card, 'Collection')).toContainText(
      'Invoice sent to the customer',
    );
    await expect(billing.row(card, 'Collection')).toContainText(
      'Organization default',
    );
    // This contract pays in 45 days, and says it is the contract's.
    await expect(billing.row(card, 'Payment terms')).toContainText(
      'Payable within 45 days',
    );
    await expect(billing.row(card, 'Payment terms')).toContainText(
      'This contract',
    );
    await expect(billing.row(card, 'Base price')).toContainText(
      'Enterprise, monthly',
    );
    await expect(billing.row(card, 'Base price')).toContainText(
      '$499.00/month · In advance',
    );
    // The periods are the API's, in UTC and half-open: the end is where the next begins.
    await expect(billing.row(card, 'Current period')).toContainText(
      'Sep 15 – Oct 15, 2026 (UTC)',
    );
    await expect(billing.row(card, 'Next boundary')).toContainText(
      'Oct 15, 2026 (UTC)',
    );
    await expect(billing.row(card, 'Started')).toContainText(
      'Aug 15, 2026 (UTC)',
    );
  });

  test('is a tab of the page, between the entitlements and the audit trail', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await billing.goto('acme-production');

    await expect(billing.tabs()).toHaveText([
      'Overview',
      'Entitlements & Usage',
      'Billing',
      'Audit Trail',
    ]);
    await expect(billing.tab()).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(
      /\/customers\/instances\/acme-production\/billing$/,
    );
  });

  test('shows what the next boundary will issue and its lines on request, and says when it would be held, leading to the usage behind it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await billing.goto('acme-production');

    const upcoming = billing.upcomingCard();
    await expect(upcoming).toContainText('Renewal');
    await expect(upcoming).toContainText('Oct 15, 2026 (UTC)');
    await expect(upcoming).toContainText('2 lines');
    // The total is the API's, never added up by the console.
    await expect(upcoming).toContainText('$503.20');

    await billing.viewLinesButton().click();
    const preview = page.getByRole('dialog', { name: 'Upcoming invoice' });
    await expect(preview).toContainText('Preview, not an invoice');
    await expect(preview).toContainText('API calls, overage');
    await expect(preview).toContainText('Enterprise, monthly');
    await page.keyboard.press('Escape');

    const banner = billing.wouldHoldBanner();
    await expect(banner).toContainText('This invoice would be held');
    await expect(banner).toContainText(
      'API Calls: Usage reports are missing from the journal.',
    );
    await banner.getByRole('link', { name: 'See its usage history' }).click();

    await expect(page).toHaveURL(
      /\/customers\/instances\/acme-production\/entitlements\?history=api-calls$/,
    );
    await expect(page.getByTestId('usage-history')).toBeVisible();
  });

  test('says in the words of the API that the usage the next invoice would be composed from is no longer kept, with nothing to ask again', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const model = createSubscriptionsModel();
    model.subscriptions.armProblem('getUpcomingInvoice', {
      code: 'GetUpcomingInvoice.OutsideRetention',
      detail:
        'the usage of this period is no longer kept: it begins before 2025-04-07T12:00:00Z',
      status: 422,
    });
    await installBillingAppMocks(page, model);

    await billing.goto('acme-production');

    await expect(billing.upcomingError()).toContainText(
      'the usage of this period is no longer kept: it begins before 2025-04-07T12:00:00Z',
    );
    // Asking again would change nothing, so it is not offered.
    await expect(
      billing.upcomingError().getByRole('button', { name: 'Retry' }),
    ).toHaveCount(0);
    // The rest of the tab is where it was.
    await expect(billing.subscriptionCard()).toContainText('Active');
    await expect(billing.invoiceRows()).toHaveCount(2);
  });

  test('lists the invoices of the instance, newest first, without saying whose they are on every row', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await billing.goto('acme-production');

    await expect(billing.invoiceRows()).toHaveCount(2);
    await expect(
      page.getByRole('columnheader', { name: 'Customer' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('columnheader', { name: 'Status' }),
    ).toBeVisible();
    await page
      .getByRole('row', { name: /Renewal/ })
      .getByRole('link')
      .first()
      .click();

    await expect(page).toHaveURL(/\/billing\/invoices\/inv-acme-renewal$/);
  });

  test('is a state and not an error for an instance nobody bills, with the way to subscribe', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await billing.goto('beta-staging');

    await expect(billing.notSubscribed()).toContainText('Not subscribed');
    await expect(billing.errorProblem()).toHaveCount(0);
    await expect(billing.subscribeLink()).toBeVisible();
    await expect(billing.subscribeLink()).toHaveAttribute(
      'href',
      '/customers/instances/beta-staging/billing/subscribe',
    );
  });

  test('says when a subscription ended, and offers to subscribe the instance again', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await billing.goto('acme-legacy');

    const card = billing.subscriptionCard();
    await expect(card).toContainText('Canceled');
    await expect(billing.row(card, 'Canceled on')).toContainText(
      'Jun 1, 2026 (UTC)',
    );
    await expect(card).toContainText('The contract was not renewed');
    await expect(card).toContainText('This subscription has ended');
    await expect(billing.subscribeLink()).toBeVisible();
    // There is nothing left to wait for: no next boundary, no upcoming invoice.
    await expect(billing.upcomingCard()).toHaveCount(0);
  });

  test('cannot be subscribed to for a version that is not on sale, and says why on a button that stays reachable', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await billing.goto('beta-lab');

    await expect(billing.subscribeButton()).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(billing.unavailableReason()).toContainText(
      'This instance runs Preview v2027.1 (Draft). Only a published license version can be subscribed to.',
    );
    await expect(billing.subscribeLink()).toHaveCount(0);
    await billing.subscribeButton().focus();
    await expect(billing.subscribeButton()).toBeFocused();
  });

  test('shows a session that may only read the state and no way to subscribe', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await signInWithScopes(page, [
      'read:billing',
      'read:instances',
      'read:licenses',
    ]);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await billing.goto('beta-staging');

    await expect(billing.notSubscribed()).toBeVisible();
    await expect(billing.subscribeLink()).toHaveCount(0);
    await expect(billing.subscribeButton()).toHaveCount(0);
  });

  test('shows a refusal in the tab, with a way to ask again, and does not blank the page around it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const model = createSubscriptionsModel();
    model.subscriptions.armProblem('getInstanceBilling', {
      code: 'Billing.EntitlementCheckUnavailable',
      detail: 'The billing entitlement could not be checked',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await billing.goto('acme-production');

    await expect(billing.errorProblem()).toContainText(
      'The billing entitlement could not be checked',
    );
    await expect(
      page
        .locator('main')
        .getByText('Acme Production', { exact: true })
        .first(),
    ).toBeVisible();
    await billing.errorProblem().getByRole('button', { name: 'Retry' }).click();

    await expect(billing.subscriptionCard()).toContainText('Active');
  });
});

test.describe('the Billing tab where billing is not there', () => {
  test.beforeEach(async ({ page }) => {
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('is absent where billing is off, and the page is the page of an instance as it was', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await page.goto('/customers/instances/acme-production');

    await expect(page.getByRole('tab', { name: 'Audit Trail' })).toBeVisible();
    await expect(billing.tabs()).toHaveText([
      'Overview',
      'Entitlements & Usage',
      'Audit Trail',
    ]);
  });

  test('explains itself at its own address instead of failing', async ({
    page,
  }) => {
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await page.goto('/customers/instances/acme-production/billing');

    await expect(page.getByTestId('billing-unavailable')).toContainText(
      'Billing is not enabled',
    );
  });

  test('is absent where the capabilities cannot be read', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createBillingOutageModel('unavailable'));

    await page.goto('/customers/instances/acme-production');

    await expect(page.getByRole('tab', { name: 'Audit Trail' })).toBeVisible();
    await expect(billing.tab()).toHaveCount(0);
  });

  test('is absent for a session that may not read billing', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await signInWithScopes(page, ['read:instances', 'read:licenses']);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await page.goto('/customers/instances/acme-production');

    await expect(page.getByRole('tab', { name: 'Audit Trail' })).toBeVisible();
    await expect(billing.tab()).toHaveCount(0);
  });
});
