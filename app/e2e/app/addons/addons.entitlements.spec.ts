import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { expectNoToast } from '../_support/assertions/toast';
import { AddonDetailDriver } from '../_support/drivers/addon-detail.driver';
import { AddonFreezeDriver } from '../_support/drivers/addon-freeze.driver';
import { AddonGrantsDriver } from '../_support/drivers/addon-grants.driver';
import { createAddonsBillingModel } from './addons.scenarios';
import { installAddonsWorld } from './install-addons-world';

// What one unit of an add-on grants an instance that holds it: a number that counts once
// per unit of quantity and combines with the license's grant of the same entitlement, a
// flag, or a configuration. The overage allowance of a number is left empty to inherit
// the license's. Pro grants ten seats and a hundred thousand tokens with a fifty percent
// overage; Extra tokens allows twenty.

const GRANT_WRITES = /^\/api\/addons\/[^/]+\/entitlements(\/[^/]+)?$/;

test.describe('what a version grants', () => {
  test('lists, for one unit, the value, how it combines with the license and the overage', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);

    await grants.goto('extra-tokens-v1', 'Extra tokens');

    await expect(grants.row('Tokens')).toContainText('10,000 per unit');
    await expect(grants.row('Tokens')).toContainText('Add');
    await expect(grants.row('Tokens')).toContainText('+20%');
    await expect(
      page.getByText('What one unit of this add-on grants an instance'),
    ).toBeVisible();
  });

  test('says an overage left empty inherits the license, and a flag is only enabled', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);

    await grants.goto('extra-seats-v1', 'Extra seats');
    await expect(grants.row('Seats')).toContainText('5 per unit');
    await expect(grants.row('Seats')).toContainText('Inherit');

    await grants.goto('priority-support-v2', 'Priority support');
    await expect(grants.row('Advanced Analytics')).toContainText('Enabled');
  });

  test('says there is nothing yet on a version that grants nothing', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);

    await page.goto('/addons/extra-seats-v2/entitlements');

    await expect(
      page.getByText('This version grants nothing yet.'),
    ).toBeVisible();
    await expect(grants.addLink()).toBeVisible();
  });
});

test.describe('giving a version an entitlement', () => {
  test('sends a number per unit, how it combines, and no overage when it is left to the license', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const writes = recordWrites(page, GRANT_WRITES);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await expect(page).toHaveURL(
      '/addons/extra-seats-v2/entitlements?grant=new',
    );
    await expect(
      grants.dialog().getByRole('heading', { name: 'Add entitlement' }),
    ).toBeVisible();
    await grants.chooseEntitlement('Seats');
    await grants.valueField().fill('5');
    // The API combines with the maximum unless it is told otherwise.
    await expect(grants.behaviorField()).toContainText('Maximum');
    await grants.chooseBehavior('Add');
    await expect(grants.overageField()).toHaveAttribute(
      'placeholder',
      'Inherit',
    );
    await grants.submitButton().click();

    await expectToast(page, 'Entitlement added');
    await expect(page).toHaveURL('/addons/extra-seats-v2/entitlements');
    await expect(grants.row('Seats')).toContainText('5 per unit');
    await expect(grants.row('Seats')).toContainText('Add');
    await expect(grants.row('Seats')).toContainText('Inherit');
    expect(writes).toEqual([
      {
        body: {
          entitlementSlug: 'seats',
          overrideBehavior: 'ADD',
          value: { type: 'number', value: 5 },
        },
        method: 'POST',
        pathname: '/api/addons/extra-seats-v2/entitlements',
      },
    ]);
  });

  test('sends the overage that was typed, and a zero for a hard limit', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const writes = recordWrites(page, GRANT_WRITES);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await grants.chooseEntitlement('Tokens');
    await grants.valueField().fill('10000');
    await grants.overageField().fill('0');
    await grants.submitButton().click();

    await expectToast(page, 'Entitlement added');
    await expect(grants.row('Tokens')).toContainText('Hard limit');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body).toEqual({
      entitlementSlug: 'tokens',
      limitCapExceededOveragePercent: 0,
      overrideBehavior: 'MAX',
      value: { type: 'number', value: 10_000 },
    });
  });

  test('sends an unlimited value as the API takes it, which allows no overage', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const writes = recordWrites(page, GRANT_WRITES);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await grants.chooseEntitlement('Storage');
    await grants.unlimitedCheckbox().check();
    await expect(grants.valueField()).toBeDisabled();
    await expect(grants.overageField()).toHaveCount(0);
    await grants.submitButton().click();

    await expectToast(page, 'Entitlement added');
    await expect(grants.row('Storage')).toContainText('Unlimited');
    expect(writes[0]?.body).toEqual({
      entitlementSlug: 'storage-gb',
      overrideBehavior: 'MAX',
      value: { type: 'number', value: -1 },
    });
  });

  test('sends a flag as enabled, with nothing of how a number combines', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const writes = recordWrites(page, GRANT_WRITES);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await grants.chooseEntitlement('Advanced Analytics');
    await expect(
      grants.dialog().getByRole('checkbox', { name: 'Enabled' }),
    ).toBeChecked();
    await expect(grants.behaviorField()).toHaveCount(0);
    await grants.submitButton().click();

    await expectToast(page, 'Entitlement added');
    await expect(grants.row('Advanced Analytics')).toContainText('Enabled');
    expect(writes[0]?.body).toEqual({
      entitlementSlug: 'analytics',
      value: { type: 'boolean', value: true },
    });
  });

  test('offers only the entitlements the version does not grant yet', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);
    await grants.goto('extra-tokens-v1', 'Extra tokens');

    await grants.addLink().click();
    await grants.entitlementField().click();

    const options = page.getByRole('option');
    await expect(options).toHaveText([
      'Seats',
      'Storage',
      'Advanced Analytics',
    ]);
  });

  test('refuses a value that is not a whole number, and an overage that is negative, before anything is sent', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const writes = recordWrites(page, GRANT_WRITES);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await grants.chooseEntitlement('Seats');
    // Nothing can be sent without a value.
    await expect(grants.submitButton()).toBeDisabled();
    await grants.valueField().fill('5');
    await expect(grants.submitButton()).toBeEnabled();

    await grants.overageField().fill('-5');
    await grants.overageField().blur();
    await expect(
      grants
        .dialog()
        .getByText('Enter a whole percentage, 0 or more, or leave it empty.'),
    ).toBeVisible();
    await expect(grants.submitButton()).toBeDisabled();
    await grants.overageField().fill('');
    await expect(grants.submitButton()).toBeEnabled();

    await grants.valueField().fill('');
    await grants.valueField().blur();
    await expect(
      grants
        .dialog()
        .getByText('Enter a whole number, 0 or more, or choose unlimited.'),
    ).toBeVisible();
    await expect(grants.submitButton()).toBeDisabled();
    expect(writes).toEqual([]);
  });

  test('closes the dialog with Cancel and leaves the tab as it was', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const writes = recordWrites(page, GRANT_WRITES);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await grants.dialog().getByRole('button', { name: 'Cancel' }).click();

    await expect(grants.dialog()).toHaveCount(0);
    await expect(page).toHaveURL('/addons/extra-seats-v2/entitlements');
    expect(writes).toEqual([]);
  });

  test('opens from a link, and drops a link to an entitlement the version does not grant', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);

    await page.goto('/addons/extra-tokens-v1/entitlements?grant=tokens');
    await expect(
      grants.dialog().getByRole('heading', { name: 'Edit entitlement' }),
    ).toBeVisible();
    await grants.dialog().getByRole('button', { name: 'Cancel' }).click();

    await page.goto('/addons/extra-tokens-v1/entitlements?grant=storage-gb');
    await expect(grants.card()).toBeVisible();
    await expect(grants.dialog()).toHaveCount(0);
    await expect(page).toHaveURL('/addons/extra-tokens-v1/entitlements');
  });
});

test.describe('the overage an add-on allows', () => {
  test('warns, on the field, when it is lower than a license it fits, and says what that does', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);
    await grants.goto('extra-tokens-v1', 'Extra tokens');

    // Extra tokens allows 20%, and Pro, which it fits, allows 50%.
    await page.goto('/addons/extra-tokens-v1/entitlements?grant=tokens');
    await expect(grants.overageWarning()).toContainText(
      'This add-on allows an overage of 20%, and Pro allows 50%.',
    );
    await expect(grants.overageWarning()).toContainText(
      'its percentage replaces the license’s: usage is refused sooner than the license says.',
    );

    // As much as the license, or more, is no stricter than it.
    await grants.overageField().fill('80');
    await expect(grants.overageWarning()).toHaveCount(0);
    await grants.overageField().fill('50');
    await expect(grants.overageWarning()).toHaveCount(0);
    await grants.overageField().fill('49');
    await expect(grants.overageWarning()).toContainText(
      'allows an overage of 49%',
    );
    // Left empty, the add-on inherits the license's, which cannot be stricter.
    await grants.overageField().fill('');
    await expect(grants.overageWarning()).toHaveCount(0);
  });

  test('warns on a new grant too, for the licenses the version fits and no other', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await grants.chooseEntitlement('Tokens');
    await grants.valueField().fill('10000');
    await grants.overageField().fill('10');
    await expect(grants.overageWarning()).toContainText(
      'This add-on allows an overage of 10%, and Pro allows 50%.',
    );
    // Starter does not grant tokens with an overage, and the version does not fit it.
    await expect(grants.overageWarning()).not.toContainText('Starter');
  });

  test('does not warn about a seat, which the license grants with no overage to compare', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await grants.chooseEntitlement('Seats');
    await grants.valueField().fill('5');
    await grants.overageField().fill('10');

    await expect(grants.overageWarning()).toHaveCount(0);
  });
});

test.describe('changing and taking away a grant', () => {
  test('replaces the value, how it combines and the overage, on an entitlement that stays the same', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const writes = recordWrites(page, GRANT_WRITES);
    await installAddonsWorld(page);
    await grants.goto('extra-tokens-v1', 'Extra tokens');

    await grants.editLink('Tokens').click();
    await expect(page).toHaveURL(
      '/addons/extra-tokens-v1/entitlements?grant=tokens',
    );
    await expect(
      grants.dialog().getByRole('heading', { name: 'Edit entitlement' }),
    ).toBeVisible();
    // The entitlement is the identity of the grant: it cannot be changed.
    await expect(grants.entitlementField()).toBeDisabled();
    await grants.valueField().fill('20000');
    await grants.chooseBehavior('Override');
    await grants.overageField().fill('');
    await grants.submitButton().click();

    await expectToast(page, 'Entitlement updated');
    await expect(grants.row('Tokens')).toContainText('20,000 per unit');
    await expect(grants.row('Tokens')).toContainText('Override');
    await expect(grants.row('Tokens')).toContainText('Inherit');
    // The overage is replaced and not merged: a member left out inherits the license's.
    expect(writes).toEqual([
      {
        body: {
          overrideBehavior: 'OVERRIDE',
          value: { type: 'number', value: 20_000 },
        },
        method: 'PUT',
        pathname: '/api/addons/extra-tokens-v1/entitlements/tokens',
      },
    ]);
  });

  test('asks before it takes one away, and says what the instances that hold the version lose', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const writes = recordWrites(page, GRANT_WRITES);
    await installAddonsWorld(page);
    await grants.goto('priority-support-v2', 'Priority support');

    await grants.removeButton('Advanced Analytics').click();
    await expect(grants.confirmation()).toContainText(
      'Remove Advanced Analytics from this add-on?',
    );
    await expect(grants.confirmation()).toContainText(
      'lose the entitlement at once',
    );
    await grants.confirmRemoval();

    await expectToast(page, 'Entitlement removed');
    await expect(
      page.getByText('This version grants nothing yet.'),
    ).toBeVisible();
    expect(writes).toEqual([
      {
        body: null,
        method: 'DELETE',
        pathname: '/api/addons/priority-support-v2/entitlements/analytics',
      },
    ]);
  });

  test('keeps the grant, and sends nothing, when the confirmation is dismissed', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const writes = recordWrites(page, GRANT_WRITES);
    await installAddonsWorld(page);
    await grants.goto('priority-support-v2', 'Priority support');

    await grants.removeButton('Advanced Analytics').click();
    await grants.confirmation().getByRole('button', { name: 'Cancel' }).click();

    await expect(grants.confirmation()).toHaveCount(0);
    await expect(grants.row('Advanced Analytics')).toBeVisible();
    expect(writes).toEqual([]);
  });

  test('says in the words of the API why a grant a price meters cannot be removed, in the dialog', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);
    await grants.goto('extra-tokens-v1', 'Extra tokens');

    await grants.removeButton('Tokens').click();
    await grants.confirmRemoval();

    await expect(grants.confirmation()).toContainText(
      'an ACTIVE price of the version meters this entitlement: deprecate the price first',
    );
    await expectNoToast(page);
    // The grant stays where it was.
    await grants.confirmation().getByRole('button', { name: 'Cancel' }).click();
    await expect(grants.row('Tokens')).toBeVisible();
  });
});

test.describe('a version an instance with a live subscription holds', () => {
  const FREEZE_TITLE = 'This version is held by a billed instance';

  test('refuses a new grant with a dialog that says what the API said, and leads to a new version', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const freeze = new AddonFreezeDriver(page);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v1', 'Extra seats');

    await grants.addLink().click();
    await grants.chooseEntitlement('Storage');
    await grants.valueField().fill('50');
    await grants.submitButton().click();

    await freeze.expectTitle(FREEZE_TITLE);
    await expect(freeze.detail()).toContainText('what it sells is frozen');
    await expect(freeze.createNewVersion()).toHaveAttribute(
      'href',
      '/addons/new?family=extra-seats',
    );
    // A dialog, not a toast.
    await expectNoToast(page);
  });

  test('refuses the edit of a grant the same way, and the removal of one', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const freeze = new AddonFreezeDriver(page);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v1', 'Extra seats');

    await grants.editLink('Seats').click();
    await grants.valueField().fill('6');
    await grants.submitButton().click();
    await freeze.expectTitle(FREEZE_TITLE);
    await freeze.dialog().getByRole('button', { name: 'Cancel' }).click();
    await expect(freeze.dialog()).toHaveCount(0);

    await grants.removeButton('Seats').click();
    await grants.confirmRemoval();
    await freeze.expectTitle(FREEZE_TITLE);
    await expectNoToast(page);
    // Nothing left the version.
    await freeze.dialog().getByRole('button', { name: 'Cancel' }).click();
    await expect(grants.row('Seats')).toContainText('5 per unit');
  });

  test('opens the new version from the dialog, which starts empty', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const freeze = new AddonFreezeDriver(page);
    const detail = new AddonDetailDriver(page);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v1', 'Extra seats');

    await grants.removeButton('Seats').click();
    await grants.confirmRemoval();
    await freeze.createNewVersion().click();

    await expect(page).toHaveURL('/addons/new?family=extra-seats');
    await expect(
      page
        .getByRole('dialog')
        .getByRole('heading', { name: 'New version of Extra seats' }),
    ).toBeVisible();
    await expect(detail.confirmation()).toHaveCount(0);
  });

  test('is changeable again once nobody bills it', async ({ page }) => {
    const grants = new AddonGrantsDriver(page);
    const model = createAddonsBillingModel();
    await installAddonsWorld(page, model);
    await grants.goto('extra-tokens-v1', 'Extra tokens');

    // No instance holds the tokens, so the same change goes through.
    await grants.editLink('Tokens').click();
    await grants.valueField().fill('12000');
    await grants.submitButton().click();

    await expectToast(page, 'Entitlement updated');
  });
});
