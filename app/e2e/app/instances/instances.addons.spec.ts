import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { InstanceAddonsDriver } from '../_support/drivers/instance-addons.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { createAddonsBillingModel } from '../addons/addons.scenarios';
import { installAddonsWorld } from '../addons/install-addons-world';
import { BILLED_NOW } from '../billing/billed-instances';

// The add-ons an instance holds are a card of its Billing tab: the quantity of each,
// stepped one unit at a time within what its version allows, the way to take one off and,
// while the subscription is live, the way to add another. A change applies to the
// entitlements at once and is billed from the next renewal, and the card says so. The
// instances of Initech are on Pro: ten seats and a hundred thousand tokens, to which an
// add-on adds.

// A version is chosen by its name and which version it is, and listed once held by the
// name its attachment carries.
const SEATS = 'Extra seats · 2026';
const TOKENS = 'Extra tokens · 2026';
const SUPPORT = 'Priority support · 2026';
const HELD_SEATS = 'Extra seats';
const HELD_TOKENS = 'Extra tokens';
const NOTE =
  'Entitlement changes now; billed from the next renewal; no proration or refund.';
const ADDON_WRITES = /\/api\/instances\/[^/]+\/addons(\/[^/]+)?$/;

test.describe('the add-ons of an instance', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
  });

  test('lists what the instance holds, with its quantity and what a unit costs, and says when a change applies and is billed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);

    await billing.goto('initech-prod');

    await expect(addons.card()).toBeVisible();
    await expect(addons.rows()).toHaveCount(1);
    await expect(addons.row(HELD_SEATS)).toContainText('extra-seats-v1');
    await expect(addons.row(HELD_SEATS)).toContainText('$10.00/month');
    await expect(addons.quantity(HELD_SEATS)).toHaveText('2');
    await expect(addons.note()).toHaveText(NOTE);
  });

  test('steps the quantity one unit at a time, one request a click: the plus is off at the most the version allows', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);
    await billing.goto('initech-prod');

    await addons.more(HELD_SEATS).click();

    await expect(addons.quantity(HELD_SEATS)).toHaveText('3');
    // Three is the most this version allows.
    await expect(addons.more(HELD_SEATS)).toBeDisabled();
    await expect(addons.note()).toHaveText(NOTE);
    await addons.fewer(HELD_SEATS).click();

    await expect(addons.quantity(HELD_SEATS)).toHaveText('2');
    await expect(addons.more(HELD_SEATS)).toBeEnabled();
    expect(writes).toEqual([
      {
        body: { quantity: 3 },
        method: 'PATCH',
        pathname: '/api/instances/initech-prod/addons/extra-seats-v1',
      },
      {
        body: { quantity: 2 },
        method: 'PATCH',
        pathname: '/api/instances/initech-prod/addons/extra-seats-v1',
      },
    ]);
  });

  test('says what a change did to what the instance is entitled to, and the entitlements tab shows it without a reload', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);
    await billing.goto('initech-prod');

    await addons.more(HELD_SEATS).click();

    // Ten seats from the license and five a unit: twenty, then twenty-five.
    await expectToast(page, 'Extra seats: now × 3');
    await expectToast(page, 'Seats: 20 → 25');
    await page.getByRole('tab', { name: 'Entitlements & Usage' }).click();
    await expect(
      page.getByRole('row').filter({ hasText: 'Seats' }).first(),
    ).toContainText('25');
  });

  test('shows the words of a refusal and puts the stepper back to what the instance holds', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    const model = createAddonsBillingModel();
    model.subscriptions.armProblem('setInstanceAddonQuantity', {
      code: 'SetInstanceAddonQuantity.QuantityExceedsMax',
      detail: 'this add-on allows at most 3 units',
      status: 422,
    });
    await installAddonsWorld(page, model);
    await billing.goto('initech-prod');

    await addons.more(HELD_SEATS).click();

    await expect(addons.alert()).toContainText(
      'this add-on allows at most 3 units',
    );
    await expect(addons.quantity(HELD_SEATS)).toHaveText('2');
  });

  test('asks before it takes one off, says what that costs, and removes it once confirmed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);
    await billing.goto('initech-prod');

    await addons.removeButton(HELD_SEATS).click();

    await expect(addons.confirmation()).toContainText(
      'Remove Extra seats from this instance?',
    );
    await expect(addons.confirmation()).toContainText(
      'The current period is not refunded, and the add-on is no longer billed from the next invoice.',
    );
    expect(writes).toEqual([]);
    await addons.confirmRemoval();

    await expect(addons.empty()).toBeVisible();
    await expectToast(page, 'Extra seats removed');
    expect(writes).toEqual([
      {
        body: null,
        method: 'DELETE',
        pathname: '/api/instances/initech-prod/addons/extra-seats-v1',
      },
    ]);
  });

  test('puts the entitlements back to the license when an add-on goes', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);
    await billing.goto('initech-prod');

    await addons.removeButton(HELD_SEATS).click();
    await addons.confirmRemoval();

    await expectToast(page, 'Seats: 20 → 10');
  });

  test('keeps the add-on, and sends nothing, when the confirmation to remove it is dismissed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);
    await billing.goto('initech-prod');

    await addons.removeButton(HELD_SEATS).click();
    await addons.confirmation().getByRole('button', { name: 'Cancel' }).click();

    await expect(addons.confirmation()).toHaveCount(0);
    await expect(addons.row(HELD_SEATS)).toBeVisible();
    expect(writes).toEqual([]);
  });
});

test.describe('adding an add-on to an instance', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
  });

  test('offers the versions on sale that fit its license, of a family it holds none of', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);
    await billing.goto('initech-prod');

    await addons.openAttach();

    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-prod\/billing\/attach-addon$/,
    );
    // The seats are held, their next version is a draft, and the first of the support
    // is withdrawn: the support on sale and the tokens are left.
    expect(await addons.optionNames()).toEqual([SUPPORT, TOKENS]);
  });

  test('describes the version chosen, and what the subscription bills for a unit', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);
    await billing.goto('initech-prod');
    await addons.openAttach();

    await addons.chooseAddon(TOKENS);

    await expect(addons.attachDetails()).toContainText(
      'Ten thousand more tokens a unit',
    );
    await expect(addons.attachDetails()).toContainText(
      '$5.00/month per unit, billed from the next renewal.',
    );
    await expect(addons.dialog().getByTestId('addons-note')).toHaveText(NOTE);
  });

  test('sends the version and the units once, lists it, and says what it did to the entitlements', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);
    await billing.goto('initech-prod');
    await addons.openAttach();
    await addons.chooseAddon(TOKENS);

    await addons.attachQuantityField().fill('3');
    await addons.attachButton().click();

    await expect(addons.dialog()).toHaveCount(0);
    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-prod\/billing$/,
    );
    await expect(addons.row(HELD_TOKENS)).toBeVisible();
    await expect(addons.quantity(HELD_TOKENS)).toHaveText('3');
    await expectToast(page, 'Extra tokens · 2026 added (× 3)');
    // Three units of ten thousand on the hundred thousand the license grants.
    await expectToast(page, 'Tokens: 100,000 → 130,000');
    expect(writes).toEqual([
      {
        body: { addonSlug: 'extra-tokens-v1', quantity: 3 },
        method: 'POST',
        pathname: '/api/instances/initech-prod/addons',
      },
    ]);
  });

  test('stops at the most a version allows: a quantity above it is refused in words, before the API is asked', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);
    await billing.goto('initech-trial');
    await addons.openAttach();
    await addons.chooseAddon(SEATS);

    await expect(addons.dialog()).toContainText('From 1 to 3.');
    await addons.attachQuantityField().fill('4');
    await addons.attachQuantityField().blur();

    await expect(addons.dialog()).toContainText(
      'This add-on allows fewer units',
    );
    // Nothing can be sent while the quantity is out of bounds.
    await expect(addons.attachButton()).toBeDisabled();
    expect(writes).toEqual([]);
  });

  test('shows a refusal on the field it is about: a version with no price for the period of the subscription', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);
    await billing.goto('initech-annual');
    await addons.openAttach();

    await addons.chooseAddon(TOKENS);

    // The dialog says it before it is asked, and the API says it when it is.
    await expect(addons.attachDetails()).toContainText(
      'no default price for the billing period of the subscription (Annual)',
    );
    await addons.attachButton().click();

    await expect(addons.dialog()).toContainText(
      "the add-on has no default ACTIVE price for the subscription's ANNUAL period",
    );
    await expect(addons.dialog()).toBeVisible();
    await expect(addons.card()).toHaveCount(1);
  });

  test('waits out a period that is being closed, says so in place of an error, and sends the same request again', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    const model = createAddonsBillingModel();
    model.subscriptions.armProblem('attachInstanceAddon', {
      code: 'AttachInstanceAddon.BoundaryPending',
      detail: 'the period has ended and is being closed; retry in a minute',
      retryAfterSeconds: 1,
      status: 409,
    });
    await installAddonsWorld(page, model);
    await billing.goto('initech-prod');
    await addons.openAttach();
    await addons.chooseAddon(TOKENS);

    await addons.attachButton().click();

    await expect(addons.closing()).toContainText('Closing the period');
    await expect(addons.dialog().getByRole('alert')).toHaveCount(0);
    await expect(addons.dialog()).toHaveCount(0);
    await expect(addons.row(HELD_TOKENS)).toBeVisible();
    // The very same request, twice: nothing was changed by the first.
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
  });

  test('offers the way to add one while the subscription is live: in its trial, active or past due', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);

    for (const slug of ['initech-trial', 'initech-prod', 'initech-late']) {
      await billing.goto(slug);
      await expect(addons.attachLink()).toBeVisible();
      await expect(addons.notLive()).toHaveCount(0);
    }
  });

  test('does not offer it once the subscription has ended, says why, and still lets what the instance holds be stepped and removed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);

    await billing.goto('initech-ended');

    await expect(addons.card()).toBeVisible();
    await expect(addons.attachLink()).toHaveCount(0);
    await expect(addons.notLive()).toContainText(
      'Add-ons can be added while the subscription is live',
    );
    await expect(addons.quantity(HELD_SEATS)).toHaveText('1');
    await addons.more(HELD_SEATS).click();
    await expect(addons.quantity(HELD_SEATS)).toHaveText('2');
  });

  test('says there is nothing to add when it is opened from a link on a subscription that is not live', async ({
    page,
  }) => {
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);

    await page.goto('/customers/instances/initech-ended/billing/attach-addon');

    await expect(addons.unavailable()).toContainText(
      'Add-ons can only be added while the subscription is live',
    );
    await expect(addons.attachButton()).toHaveCount(0);
  });

  test('has no card for an instance nobody bills that holds none', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);

    await billing.goto('initech-fresh');

    await expect(billing.notSubscribed()).toBeVisible();
    await expect(addons.card()).toHaveCount(0);
  });
});

test.describe('who may change the add-ons of an instance', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
  });

  test('is read, with no control, by a session that may not write them', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await installAddonsWorld(page);

    await billing.goto('initech-prod');

    await expect(addons.row(HELD_SEATS)).toContainText('2');
    await expect(addons.stepper(HELD_SEATS)).toHaveCount(0);
    await expect(addons.removeButton(HELD_SEATS)).toHaveCount(0);
    await expect(addons.attachLink()).toHaveCount(0);
  });

  test('has no card for a session that may not read the add-ons of an instance', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await signInWithScopes(page, [
      'read:billing',
      'read:licenses',
      'read:customers',
    ]);
    await installAddonsWorld(page);

    await billing.goto('initech-prod');

    await expect(billing.subscriptionCard()).toBeVisible();
    await expect(addons.card()).toHaveCount(0);
  });
});

test.describe('a period being closed, while an add-on is changed', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(BILLED_NOW) });
  });

  test('is waited out for a minute, sent again once, and shown as the API said it when it is refused again, with a way to ask once more', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    const model = createAddonsBillingModel();
    model.subscriptions.armProblem('setInstanceAddonQuantity', {
      code: 'SetInstanceAddonQuantity.BoundaryPending',
      detail: 'the period has ended and is being closed; retry in a minute',
      retryAfterSeconds: 60,
      status: 409,
      times: 2,
    });
    await installAddonsWorld(page, model);
    await billing.goto('initech-prod');

    await addons.more(HELD_SEATS).click();

    // The first refusal is not an error: the card says what is happening.
    await expect(addons.closing()).toContainText('Closing the period');
    await expect(addons.alert()).toHaveCount(0);
    expect(writes).toHaveLength(1);
    await page.clock.runFor(59_000);
    expect(writes).toHaveLength(1);
    await page.clock.runFor(1_000);

    // One automatic resend, with the same body. Refused again: the words of the API and a Retry.
    await expect(addons.alert()).toContainText(
      'the period has ended and is being closed',
    );
    await expect(addons.closing()).toHaveCount(0);
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
    await expect(addons.quantity(HELD_SEATS)).toHaveText('2');
    await addons.alert().getByRole('button', { name: 'Retry' }).click();

    await expect(addons.quantity(HELD_SEATS)).toHaveText('3');
    expect(writes).toHaveLength(3);
  });
});

test.describe('subscribing an instance with add-ons', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
  });

  test('lists the versions on sale that fit its license, each to include or not, with units from one to what the version allows', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);
    await billing.goto('initech-fresh');

    await billing.openSubscribe();

    await expect(addons.subscribeAddons()).toContainText('Up to 3 units');
    await expect(addons.subscribeChoice(SEATS)).not.toBeChecked();
    await expect(addons.subscribeChoice(TOKENS)).not.toBeChecked();
    await expect(addons.subscribeChoice(SUPPORT)).not.toBeChecked();
    // A draft is not on sale and the withdrawn version cannot be attached.
    await expect(addons.subscribeAddons().getByRole('checkbox')).toHaveCount(3);
    await addons.subscribeChoice(SEATS).check();
    await addons.more(SEATS).click();
    await addons.more(SEATS).click();
    await expect(addons.quantity(SEATS)).toHaveText('3');
    await expect(addons.more(SEATS)).toBeDisabled();
  });

  test('sends the add-ons that were included, each with its units, with the subscription, and lists them once it started', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    const writes = recordWrites(page, /\/api\/instances\/[^/]+\/billing$/);
    await installAddonsWorld(page);
    await billing.goto('initech-fresh');
    await billing.openSubscribe();
    await billing.trialDaysField().fill('0');

    await addons.subscribeChoice(SEATS).check();
    await addons.more(SEATS).click();
    await addons.subscribeChoice(TOKENS).check();
    await billing.confirmButton().click();

    await expect(billing.started()).toBeVisible();
    expect(writes).toEqual([
      {
        body: {
          addOns: [
            { addonSlug: 'extra-seats-v1', quantity: 2 },
            { addonSlug: 'extra-tokens-v1', quantity: 1 },
          ],
          basePriceId: 'price-pro-monthly',
          providerKind: 'NOOP',
          trialDays: 0,
        },
        method: 'POST',
        pathname: '/api/instances/initech-fresh/billing',
      },
    ]);
    await billing.close();
    await expect(addons.row(HELD_SEATS)).toBeVisible();
    await expect(addons.quantity(HELD_SEATS)).toHaveText('2');
    await expect(addons.row(HELD_TOKENS)).toBeVisible();
  });

  test('starts with none when none is included: the request carries no add-on', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, /\/api\/instances\/[^/]+\/billing$/);
    await installAddonsWorld(page);
    await billing.goto('initech-fresh');
    await billing.openSubscribe();

    await billing.confirmButton().click();

    await expect(billing.started()).toBeVisible();
    expect(writes[0].body).not.toHaveProperty('addOns');
  });

  test('shows the refusal of an add-on on its field, with the words of the API, and does not start the subscription', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await installAddonsWorld(page);
    await billing.goto('initech-fresh');
    await billing.openSubscribe();
    // The tokens are sold by the month: on an annual subscription the API refuses them.
    await billing.chooseBasePrice(/Pro, annual/);
    await addons.subscribeChoice(TOKENS).check();

    await billing.confirmButton().click();

    await expect(addons.subscribeAddons().getByRole('alert')).toContainText(
      "the add-on has no default ACTIVE price for the subscription's ANNUAL period",
    );
    await expect(billing.started()).toHaveCount(0);
    // What was typed stays, and nothing was attached: the instance still bills nothing.
    await expect(addons.subscribeChoice(TOKENS)).toBeChecked();
    await billing.close();
    await expect(billing.notSubscribed()).toBeVisible();
  });
});
