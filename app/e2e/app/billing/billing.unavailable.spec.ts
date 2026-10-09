import { expect, test } from '../_support/app-test';
import { expectNoToast } from '../_support/assertions/toast';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { createCustomersListModel } from '../customers/customers.scenarios';
import {
  createBillingDisabledModel,
  createBillingOutageModel,
  createBillingStackModel,
} from './billing.scenarios';

// Billing exists on a deployment only where GET /billing/capabilities says so,
// and fails closed everywhere else: a link to a billing page then explains why
// there is no billing, as an explanation and never as an error, and asks the API
// for nothing but the capabilities. The routes of the billing screens that follow
// join the deep links below as they are built (vouchers, the settings page, the
// tabs of an instance and of a license version).

const BILLING_DEEP_LINKS = [
  '/invoices',
  '/invoices?view=handoff',
  '/invoices/inv-1',
  '/invoices/inv-1/lines/inv-1-line-1',
  '/addons',
  '/addons/new',
  '/addons/extra-seats-v1',
  '/addons/extra-seats-v1/prices',
];

test.describe('billing off on the deployment', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
  });

  for (const path of BILLING_DEEP_LINKS) {
    test(`explains, on ${path}, how to turn billing on`, async ({ page }) => {
      const nav = new BillingNavDriver(page);

      await page.goto(path);

      await nav.expectUnavailable('DEPLOYMENT_DISABLED');
      await expect(page.getByText('Billing is not enabled')).toBeVisible();
      await expect(page.getByText(/KAITEN_BILLING_ENABLED/)).toBeVisible();
      // An explanation, not an error and not a missing page.
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByText('Page not found')).toHaveCount(0);
      await nav.expectNoSection();
    });
  }

  test('explains too for a path under the invoices that is no page', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);

    await page.goto('/invoices/inv-1/nowhere');

    await nav.expectUnavailable('DEPLOYMENT_DISABLED');
    await expect(page.getByText('Page not found')).toHaveCount(0);
  });

  test('requests nothing of billing but its capabilities', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    const requests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/')) {
        requests.push(`${request.method()} ${pathname}`);
      }
    });

    await nav.gotoShell();
    await page.goto('/invoices');
    await expect(nav.unavailable()).toBeVisible();

    const billingRequests = requests.filter((request) =>
      /\/api\/(billing|invoices|instances\/[^/]+\/billing)/.test(request),
    );
    expect(billingRequests.length).toBeGreaterThan(0);
    expect(new Set(billingRequests)).toEqual(
      new Set(['GET /api/billing/capabilities']),
    );
  });
});

test.describe('billing not part of the plan (Cloud)', () => {
  test('offers the upgrade on a deep link', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('NOT_ENTITLED'),
    );

    await page.goto('/invoices');

    await nav.expectUnavailable('NOT_ENTITLED');
    await expect(
      page.getByText('Billing is not part of your plan'),
    ).toBeVisible();
    await expect(page.getByText(/Upgrade your plan/)).toBeVisible();
    await expect(page.getByText(/KAITEN_BILLING_ENABLED/)).toHaveCount(0);
    await nav.expectNoSection();
  });
});

test.describe('capabilities that cannot be read', () => {
  test('fail closed on a 503: no billing, no toast, one warning, and a retry', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (
        message.type() === 'warning' &&
        message.text().includes('Billing capabilities')
      ) {
        warnings.push(message.text());
      }
    });
    await installBillingAppMocks(page, createBillingOutageModel('unavailable'));

    await nav.gotoShell();

    await nav.expectNoSection();
    await expectNoToast(page);
    expect(warnings).toHaveLength(1);

    await page.goto('/invoices');
    await nav.expectUnavailable('UNREACHABLE');
    await expect(page.getByText('Billing could not be reached')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expectNoToast(page);
  });

  test('fail closed on a 403, and say which scope the session lacks', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(
      page,
      createBillingOutageModel('missingScope'),
    );

    await nav.gotoShell();
    await nav.expectNoSection();

    await page.goto('/invoices');

    await nav.expectUnavailable('MISSING_SCOPE');
    await expect(
      page.getByText('You do not have access to billing'),
    ).toBeVisible();
    // The banner names the scope, and where to add it: no blank page.
    await expect(
      nav.unavailable().getByText('read:billing', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/token template of your identity provider/),
    ).toBeVisible();
  });

  test('read an API older than billing as billing not being there, and leave the rest of the console working', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const customers = new CustomersListDriver(page);
    await installCustomerAppMocks(page, createCustomersListModel());
    await installBillingAppMocks(
      page,
      createBillingOutageModel('notImplemented'),
    );

    // A page that has nothing to do with billing renders, and reports nothing.
    await customers.goto();

    await customers.expectCustomerVisible('Acme Corp');
    await nav.expectNoSection();
    await expectNoToast(page);

    await page.goto('/invoices');

    await nav.expectUnavailable('FEATURE_UNAVAILABLE');
    await expect(page.getByText('Not available in this version')).toBeVisible();
    await expectNoToast(page);
  });

  test('give up on an API that never answers after the timeout, still without billing', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingOutageModel('hang'));

    await nav.gotoShell();
    // Nothing billing-related renders half-loaded while it waits.
    await nav.expectNoSection();

    await page.goto('/invoices');

    await nav.expectUnavailable('UNREACHABLE', { timeout: 20_000 });
    await nav.expectNoSection();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});

test.describe('billing on', () => {
  test('says a path under the invoices that is no page is none, with no explanation', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await page.goto('/invoices/inv-1/nowhere');

    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(nav.unavailable()).toHaveCount(0);
  });
});
