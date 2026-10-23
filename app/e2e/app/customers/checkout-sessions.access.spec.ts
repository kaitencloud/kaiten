import { expect, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { CheckoutSessionsDriver } from '../_support/drivers/checkout-sessions.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import {
  BillingAppModel,
  CAPABILITIES_OUTAGES,
} from '../_support/model/billing-app-model';
import {
  billingCapabilitiesProfiles,
  NO_BILLING_FEATURES,
} from '../_support/model/billing-capabilities';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { createBillingDisabledModel } from '../billing/billing.scenarios';
import { createEmptyInstancesModel } from '../instances/instances.scenarios';
import {
  CHECKOUT_NOW,
  createCheckoutSessionsBillingModel,
  createCheckoutSessionsCustomersModel,
} from './checkout-sessions.scenarios';

// Where the checkouts are, and who sees them. They exist where billing is on, the release
// ships the public surface (`features.publicSurface`) and the session holds `read:billing`:
// the tab of Customers is left out otherwise, and the route says why in place of the
// screen and asks the API for no checkout.

const CHECKOUT_READS = /^\/api\/checkout-sessions(\/|$)/;
const KEY_READS = /^\/api\/publishable-keys(\/|$)/;

const READER = [...SESSION_SCOPES.reader];
const WITHOUT_BILLING = ['read:instances', 'read:customers', 'read:licenses'];

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(CHECKOUT_NOW));
  await installCustomerAppMocks(page, createCheckoutSessionsCustomersModel());
});

test.describe('the tab of Customers', () => {
  test('is listed beside the customers and the instances where billing is on, and opens the checkouts', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await signInWithScopes(page, READER);
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    await page.goto('/customers');
    await expect(checkouts.tab('Checkouts')).toBeVisible();
    await expect(checkouts.tab('Checkouts')).toHaveAttribute(
      'href',
      '/customers/checkout-sessions',
    );
    await checkouts.tab('Checkouts').click();

    await expect(page).toHaveURL('/customers/checkout-sessions');
    await checkouts.expectLoaded();
    await expect(checkouts.rows()).toHaveCount(6);
    await expect(checkouts.tab('Checkouts')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('is listed on the pages of the instances too', async ({ page }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installInstanceAppMocks(page, createEmptyInstancesModel());
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    await page.goto('/customers/instances');

    await expect(checkouts.tab('Checkouts')).toBeVisible();
  });

  test('is left out where the release does not ship the public surface', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(
      page,
      new BillingAppModel({
        capabilities: {
          ...billingCapabilitiesProfiles.stack(),
          features: NO_BILLING_FEATURES,
        },
      }),
    );

    await page.goto('/customers');

    await expect(checkouts.tab('Instances')).toBeVisible();
    await expect(checkouts.tab('Checkouts')).toHaveCount(0);
  });

  test.describe('where billing is off', () => {
    for (const reason of ['DEPLOYMENT_DISABLED', 'NOT_ENTITLED'] as const) {
      test(`is left out: ${reason}`, async ({ page }) => {
        const checkouts = new CheckoutSessionsDriver(page);
        await installBillingAppMocks(page, createBillingDisabledModel(reason));

        await page.goto('/customers');

        await expect(checkouts.tab('Instances')).toBeVisible();
        await expect(checkouts.tab('Checkouts')).toHaveCount(0);
      });
    }
  });

  test('is left out where the capabilities cannot be read', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    const model = createCheckoutSessionsBillingModel();
    model.failCapabilities(CAPABILITIES_OUTAGES.unavailable);
    await installBillingAppMocks(page, model);

    await page.goto('/customers');

    await expect(checkouts.tab('Instances')).toBeVisible();
    await expect(checkouts.tab('Checkouts')).toHaveCount(0);
  });

  test('is left out for a session without read:billing, and offered to one that has it', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    await signInWithScopes(page, WITHOUT_BILLING);
    await page.goto('/customers');
    await expect(checkouts.tab('Instances')).toBeVisible();
    await expect(checkouts.tab('Checkouts')).toHaveCount(0);

    await signInWithScopes(page, ['read:billing', ...WITHOUT_BILLING]);
    await page.goto('/customers');
    await expect(checkouts.tab('Checkouts')).toBeVisible();
  });
});

test.describe('where billing is not there', () => {
  const REASONS = [
    [
      'DEPLOYMENT_DISABLED',
      () => createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    ],
    ['NOT_ENTITLED', () => createBillingDisabledModel('NOT_ENTITLED')],
    [
      'FEATURE_UNAVAILABLE',
      () =>
        new BillingAppModel({
          capabilities: {
            ...billingCapabilitiesProfiles.stack(),
            features: NO_BILLING_FEATURES,
          },
        }),
    ],
  ] as const;

  for (const [reason, createModel] of REASONS) {
    test(`explains ${reason} in place of the screen, and asks the API for no checkout`, async ({
      page,
    }) => {
      const nav = new BillingNavDriver(page);
      const reads = recordWrites(page, CHECKOUT_READS, ['GET']);
      await installBillingAppMocks(page, createModel());

      await page.goto('/customers/checkout-sessions?session=cs-open');

      await nav.expectUnavailable(reason);
      await expect(page.getByText('Page not found')).toHaveCount(0);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Checkouts' }),
      ).toHaveCount(0);
      expect(reads).toEqual([]);
    });
  }

  test('explains the scope the capabilities lack, for a session without read:billing', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const model = createCheckoutSessionsBillingModel();
    model.failCapabilities(CAPABILITIES_OUTAGES.missingScope);
    await installBillingAppMocks(page, model);

    await page.goto('/customers/checkout-sessions');

    await nav.expectUnavailable('MISSING_SCOPE');
  });
});

test.describe('the key of a checkout', () => {
  test('is named by its label for a session that may read the keys', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    const keyReads = recordWrites(page, KEY_READS, ['GET']);
    await signInWithScopes(page, [...READER, 'read:publishable_keys']);
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    await checkouts.goto();

    await expect(checkouts.row('dana@hooli.test')).toContainText(
      'Checkout page',
    );
    expect(keyReads.length).toBeGreaterThan(0);
  });

  test('shows the id of the key, and asks for no key, for a session that may not read them', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    const keyReads = recordWrites(page, KEY_READS, ['GET']);
    await signInWithScopes(page, READER);
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    await checkouts.goto();

    await expect(checkouts.rows()).toHaveCount(6);
    await expect(checkouts.row('dana@hooli.test')).toContainText('pk-checkout');
    await expect(checkouts.row('dana@hooli.test')).not.toContainText(
      'Checkout page',
    );
    expect(keyReads).toEqual([]);
  });
});

test.describe('the list of checkouts, when the API refuses it', () => {
  test('shows the words of the API around the console that still works', async ({
    page,
  }) => {
    const model = createCheckoutSessionsBillingModel();
    model.checkoutSessions.armProblem('listCheckoutSessions', {
      code: 'Auth.MissingScope',
      detail: 'missing required scope: read:billing',
      status: 403,
    });
    await installBillingAppMocks(page, model);

    await page.goto('/customers/checkout-sessions');

    await expect(page.getByTestId('billing-route-error')).toContainText(
      'read:billing',
    );
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  });
});
