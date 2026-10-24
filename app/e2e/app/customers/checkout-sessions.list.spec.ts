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
    // The customer is named as the list of customers names it; the contract carries its
    // slug only. The instance keeps its slug where no list of instances names it.
    await expect(
      completed.getByRole('link', { name: 'Bought Online', exact: true }),
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
      expired.getByRole('link', { name: 'Lapsed Buyer', exact: true }),
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

  test('filters by billing period, which the checkout asked for', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();

    await checkouts.addFilter('Period');
    await checkouts.pick('Annual');
    await checkouts.closeEditor();
    await expect(checkouts.rows()).toHaveCount(1);
    await expect(checkouts.rows().first()).toContainText('carol@globex.test');
    await checkouts.expectChips(['Period: Annual']);
  });

  test('shows when each checkout was made and when it expires, on screen without scrolling sideways', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await page.setViewportSize({ height: 800, width: 1280 });
    await checkouts.goto();

    const completed = checkouts.row('alice@acme.test');
    await expect(completed).toContainText('Oct 6, 2026');
    await expect(completed).toContainText('Oct 7, 2026');
    // The column the list is sorted by, and the one beside it, are inside the container.
    const container = page.getByRole('table').first().locator('..');
    const visible = await container.boundingBox();
    for (const name of ['Created', 'Expires']) {
      const header = await page
        .getByRole('columnheader', { name })
        .boundingBox();
      expect(header).not.toBeNull();
      expect((header?.x ?? 0) + (header?.width ?? 0)).toBeLessThanOrEqual(
        (visible?.x ?? 0) + (visible?.width ?? 0),
      );
    }
  });

  test('sorts by when a checkout expires', async ({ page }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();
    await checkouts.sortBy('Expires');
    await expect(checkouts.rows().first()).toContainText('dana@hooli.test');
    await expect(checkouts.rows().last()).toContainText('finance@globex.test');
    await checkouts.sortBy('Expires');
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

  test('drops the status from the address once the chip is cleared, so that a reload lists everything', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?status=expired');
    await expect(checkouts.rows()).toHaveCount(1);

    await checkouts.removeFilter('Status');
    await expect(checkouts.rows()).toHaveCount(6);
    await expect(page).toHaveURL('/customers/checkout-sessions');

    await page.reload();
    await expect(checkouts.rows()).toHaveCount(6);
  });

  test('applies the status of a link to the page that is followed while the list is open', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();
    await expect(checkouts.rows()).toHaveCount(6);

    // What a link to `?status=` does in the console: a navigation of the router.
    await page.evaluate(() => {
      history.pushState({}, '', '/customers/checkout-sessions?status=expired');
      dispatchEvent(new PopStateEvent('popstate'));
    });

    await expect(checkouts.rows()).toHaveCount(1);
    await expect(checkouts.rows().first()).toContainText('finance@globex.test');
    await expect(page).toHaveURL('/customers/checkout-sessions?status=expired');
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

test.describe('the list of checkouts, with none yet, on a phone', () => {
  test.use({ viewport: { height: 812, width: 375 } });

  test('reads the first-use message in full, inside the screen, not cut off with the table', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(
      page,
      createEmptyCheckoutSessionsBillingModel(),
    );

    await checkouts.goto();

    const message = checkouts.empty().getByText('A checkout appears here');
    await expect(message).toBeVisible();
    const box = await message.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
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

  test('says why in full, inside the screen, whatever the width of the columns of the table', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(
      page,
      createEmptyCheckoutSessionsBillingModel(),
    );

    await page.setViewportSize({ height: 800, width: 1280 });
    await checkouts.goto();

    const message = checkouts.empty().getByText('A checkout appears here');
    await expect(message).toBeVisible();
    const box = await message.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1280);
    // The whole sentence is read, not the start of one long line.
    await expect(message).toContainText(
      'allowed to open the anonymous checkout',
    );
  });
});
