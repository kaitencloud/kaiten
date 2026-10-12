import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { AddonCompatibilityDriver } from '../_support/drivers/addon-compatibility.driver';
import { createAddonsBillingModel } from './addons.scenarios';
import { installAddonsWorld } from './install-addons-world';

// Which license families an add-on version fits. It is declared against a family, not a
// version, so a new version of a license never leaves the add-on orphaned; a version that
// fits none is attachable to nothing, and the API publishes it all the same. Extra seats
// fits Pro and Starter, and its draft fits Pro.

const COMPATIBILITY_WRITES =
  /^\/api\/addons\/[^/]+\/compatible-license-families(\/[^/]+)?$/;

// A box shows what the API holds, and not what was clicked: it changes once the request has
// answered. So it is clicked, and its state is waited for, and not checked with `check()`,
// which expects the state to change at once.
test.describe('the licenses a version fits', () => {
  test('lists a box for each license family, checked for the ones the version fits', async ({
    page,
  }) => {
    const compatibility = new AddonCompatibilityDriver(page);
    await installAddonsWorld(page);

    await compatibility.goto('extra-seats-v1', 'Extra seats');

    await expect(compatibility.box(/^Pro/)).toBeChecked();
    await expect(compatibility.box(/^Starter/)).toBeChecked();
    await expect(compatibility.box(/^Enterprise/)).not.toBeChecked();
    await expect(compatibility.emptyWarning()).toHaveCount(0);
    await expect(
      page.getByText(
        'Every version of a family counts, so a new license version never leaves the add-on orphaned.',
      ),
    ).toBeVisible();
  });

  test('declares a family with one request, and takes it back with another, each as the box asks', async ({
    page,
  }) => {
    const compatibility = new AddonCompatibilityDriver(page);
    const writes = recordWrites(page, COMPATIBILITY_WRITES);
    await installAddonsWorld(page);
    await compatibility.goto('extra-seats-v1', 'Extra seats');

    await compatibility.box(/^Enterprise/).click();
    await expect(compatibility.box(/^Enterprise/)).toBeChecked();
    await compatibility.box(/^Starter/).click();
    await expect(compatibility.box(/^Starter/)).not.toBeChecked();

    expect(writes).toEqual([
      {
        body: null,
        method: 'PUT',
        pathname:
          '/api/addons/extra-seats-v1/compatible-license-families/enterprise',
      },
      {
        body: null,
        method: 'DELETE',
        pathname:
          '/api/addons/extra-seats-v1/compatible-license-families/starter',
      },
    ]);
  });

  test('keeps what it declared across a reload', async ({ page }) => {
    const compatibility = new AddonCompatibilityDriver(page);
    await installAddonsWorld(page);
    await compatibility.goto('extra-seats-v2', 'Extra seats');

    await compatibility.box(/^Starter/).click();
    await expect(compatibility.box(/^Starter/)).toBeChecked();

    // The mocks keep their state for the page, and read it again with the screen.
    await compatibility.goto('extra-seats-v2', 'Extra seats');
    await expect(compatibility.box(/^Starter/)).toBeChecked();
    await expect(compatibility.box(/^Pro/)).toBeChecked();
  });

  test('warns that a version that fits no family is attachable to nothing, until it fits one', async ({
    page,
  }) => {
    const compatibility = new AddonCompatibilityDriver(page);
    await installAddonsWorld(page);
    await compatibility.goto('extra-seats-v2', 'Extra seats');
    await expect(compatibility.emptyWarning()).toHaveCount(0);

    await compatibility.box(/^Pro/).click();

    await expect(compatibility.emptyWarning()).toContainText(
      'Attachable to nothing',
    );
    await expect(compatibility.emptyWarning()).toContainText(
      'No license family is compatible, so no instance can attach this version.',
    );
    await compatibility.box(/^Enterprise/).click();
    await expect(compatibility.emptyWarning()).toHaveCount(0);
  });

  test('is not frozen by an instance that holds the version: a billed version can fit more licenses', async ({
    page,
  }) => {
    const compatibility = new AddonCompatibilityDriver(page);
    await installAddonsWorld(page);
    // Initech Production, which lives on a subscription, holds the seats.
    await compatibility.goto('extra-seats-v1', 'Extra seats');

    await compatibility.box(/^Enterprise/).click();

    await expect(compatibility.box(/^Enterprise/)).toBeChecked();
  });

  test('says in the words of the API why a family was not declared, and shows the box as it is', async ({
    page,
  }) => {
    const compatibility = new AddonCompatibilityDriver(page);
    const model = createAddonsBillingModel();
    model.addons.armProblem('setAddonCompatibility', {
      code: 'SetAddonCompatibility.FamilyNotFound',
      detail: 'license family "enterprise" not found',
      status: 404,
    });
    await installAddonsWorld(page, model);
    await compatibility.goto('extra-seats-v1', 'Extra seats');

    await compatibility.box(/^Enterprise/).click();

    await expectToast(page, 'license family "enterprise" not found');
    await expect(compatibility.box(/^Enterprise/)).not.toBeChecked();
    await expect(compatibility.box(/^Enterprise/)).toBeEnabled();
  });
});
