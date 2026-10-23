import { expect, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { CheckoutSessionsDriver } from '../_support/drivers/checkout-sessions.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import {
  CHECKOUT_NOW,
  createCheckoutSessionsBillingModel,
  createCheckoutSessionsCustomersModel,
  createEmptyCheckoutSessionsBillingModel,
} from './checkout-sessions.scenarios';

// The anonymous checkouts under Customers: every checkout of the organization with who
// started it, what it asks for and what it created, to search and filter in the browser.
// The page is frozen at CHECKOUT_NOW, because a checkout still open past its expiry reads
// as abandoned and the model judges that from the clock of the page.

const CHECKOUT_READS = /^\/api\/checkout-sessions(\/|$)/;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(CHECKOUT_NOW));
  await installCustomerAppMocks(page, createCheckoutSessionsCustomersModel());
});

test.describe('the list of checkouts', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());
  });

  test('lists every checkout, newest first, with what it asks for and what it created', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();

    await expect(checkouts.rows()).toHaveCount(6);
    await expect(checkouts.rows().first()).toContainText('dana@hooli.test');
    await expect(checkouts.rows().last()).toContainText('finance@globex.test');

    const completed = checkouts.row('alice@acme.test');
    await expect(completed).toContainText('Completed');
    await expect(completed).toContainText('cmp-17');
    await expect(completed).toContainText('pro');
    await expect(completed).toContainText('Monthly');
    await expect(completed).toContainText('€49.00');
    await expect(completed).toContainText('Checkout page');
    await expect(
      completed.getByRole('link', { name: 'bought-online', exact: true }),
    ).toHaveAttribute('href', '/customers/bought-online');
    await expect(
      completed.getByRole('link', { name: 'bought-online-prod' }),
    ).toHaveAttribute(
      'href',
      '/customers/instances/bought-online-prod/billing',
    );
  });

  test('names the key whose page started a checkout, a retired one included', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();

    await expect(checkouts.row('carol@globex.test')).toContainText(
      'Legacy checkout',
    );
    await expect(checkouts.row('carol@globex.test')).toContainText('Annual');
    await expect(checkouts.row('carol@globex.test')).toContainText('pro-v2');
  });

  test('has no link to a customer or an instance before the completion ran, and says on an expired checkout that its records stay', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();

    // Only the e-mail, which opens the panel of the checkout, is a link.
    await expect(
      checkouts.row('dana@hooli.test').getByRole('link'),
    ).toHaveCount(1);
    const expired = checkouts.row('finance@globex.test');
    await expect(expired).toContainText('Expired');
    await expect(expired).toContainText('Stays after expiry');
    await expect(
      expired.getByRole('link', { name: 'lapsed-buyer', exact: true }),
    ).toBeVisible();
    await expect(checkouts.row('alice@acme.test')).not.toContainText(
      'Stays after expiry',
    );
  });

  test('reads a checkout left open past its expiry as abandoned, as the API does', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();

    await expect(checkouts.row('visitor@example.test')).toContainText(
      'Abandoned',
    );
    await expect(checkouts.row('dana@hooli.test')).toContainText('Open');
    await expect(checkouts.row('ravi@initech.test')).toContainText(
      'Awaiting payment',
    );
  });

  test('narrows in the browser, with no new request and no filter sent to the API', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    const reads = recordWrites(page, CHECKOUT_READS, ['GET']);

    await checkouts.goto();
    await expect(checkouts.rows()).toHaveCount(6);
    const loaded = reads.length;

    await checkouts.addFilter('Status');
    await checkouts.pick('Expired');
    await checkouts.closeEditor();
    await expect(checkouts.rows()).toHaveCount(1);

    await checkouts.search('cmp-42');
    await expect(checkouts.rows()).toHaveCount(1);
    await expect(checkouts.rows().first()).toContainText('finance@globex.test');

    await checkouts.search('cmp-17');
    await expect(checkouts.filteredEmpty()).toBeVisible();

    expect(reads.length).toBe(loaded);
    expect(reads.map((read) => read.search ?? '')).toEqual(
      reads.map(() => expect.not.stringContaining('status=')),
    );
  });

  test('finds a checkout by e-mail, by reference and by the customer it created', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();

    await checkouts.search('ALICE@acme');
    await expect(checkouts.rows()).toHaveCount(1);
    await checkouts.search('cmp-17');
    await expect(checkouts.rows()).toHaveCount(1);
    await checkouts.search('annual-buyer');
    await expect(checkouts.rows()).toHaveCount(1);
    await expect(checkouts.rows().first()).toContainText('carol@globex.test');
    await checkouts.search('legacy');
    await expect(checkouts.rows()).toHaveCount(1);
  });

  test('filters by e-mail and by client reference apart from the search', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();

    await checkouts.addFilter('Email');
    await page.getByPlaceholder('Email address').fill('globex');
    await expect(checkouts.rows()).toHaveCount(2);

    await checkouts.addFilter('Client reference');
    await page.getByPlaceholder('Your reference').fill('cmp-42');
    await expect(checkouts.rows()).toHaveCount(1);
    await expect(checkouts.rows().first()).toContainText('finance@globex.test');
  });

  test('opens already narrowed on the status a link names', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?status=awaiting_payment');

    await expect(checkouts.rows()).toHaveCount(1);
    await expect(checkouts.rows().first()).toContainText('ravi@initech.test');
    await checkouts.expectChips(['Status: Awaiting payment']);
  });

  test('drops a status the address spells wrongly, and lists everything', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?status=nonsense');

    await expect(checkouts.rows()).toHaveCount(6);
  });

  test('sorts by the amount due today and by the date of creation', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();
    await checkouts.sortBy('Due today');
    await expect(checkouts.rows().first()).toContainText('€529.20');
    await checkouts.sortBy('Due today');
    await expect(checkouts.rows().first()).toContainText('€49.00');
    await checkouts.sortBy('Created');
    await expect(checkouts.rows().first()).toContainText('dana@hooli.test');
  });

  test('sits beside the customers and their instances', async ({ page }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();

    await expect(checkouts.tab('Customers')).toHaveAttribute(
      'href',
      '/customers',
    );
    await expect(checkouts.tab('Instances')).toHaveAttribute(
      'href',
      '/customers/instances',
    );
    await expect(checkouts.tab('Checkouts')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('the list of checkouts, with none yet', () => {
  test('says so, and why', async ({ page }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(
      page,
      createEmptyCheckoutSessionsBillingModel(),
    );

    await checkouts.goto();

    await expect(checkouts.empty()).toContainText('No checkout yet');
    await expect(checkouts.rows()).toHaveCount(0);
    await expect(checkouts.searchField()).toBeVisible();
  });
});
