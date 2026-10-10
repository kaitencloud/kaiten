import type { Page } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import {
  expectDialogAccessible,
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { PublishableKeysDriver } from '../_support/drivers/publishable-keys.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import {
  createEmptyPublishableKeysBillingModel,
  createPublishableKeysBillingModel,
} from '../integrations/integrations.scenarios';

// The publishable keys as a person who cannot use a mouse or a screen meets them: no violation
// on the list, on the dialogs and on the key shown once, in either theme; each dialog keeping
// the focus inside while it is open and closing on Escape; the origins that are folded away
// reachable from the keyboard, and a refusal said to whoever reads the form, on its field.

async function expectAccessibleInBothThemes(page: Page) {
  await settle(page);
  await expectNoAccessibilityViolations(page);

  await useLightTheme(page);
  await expectNoAccessibilityViolations(page);
}

test.describe('accessibility of the list of publishable keys', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
  });

  test('has no WCAG A/AA violations in either theme, revoked keys included', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);

    await keys.goto('?includeRevoked=true');
    await expect(keys.rows()).toHaveCount(4);

    await expectAccessibleInBothThemes(page);
  });

  test('names the search, the switch and the actions of each row', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();

    await expect(keys.searchField()).toHaveAccessibleName(/./);
    await expect(keys.includeRevoked()).toHaveAccessibleName('Include revoked');
    await expect(keys.editLink('pricing')).toHaveAccessibleName('Edit pricing');
    await expect(keys.revokeButton('pricing')).toHaveAccessibleName(
      'Revoke pricing',
    );
  });

  test('has none where a search keeps no row', async ({ page }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();

    await keys.searchField().fill('nothing like it');
    await expect(keys.filteredEmpty()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });
});

test.describe('accessibility of the dialogs of the publishable keys', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
  });

  test('the form that issues a key has no violation, holds the focus and closes on Escape', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    await keys.newKey().click();
    await expect(keys.labelField()).toBeVisible();

    await expectAccessibleInBothThemes(page);
    await expectDialogAccessible(page, keys.dialog());
  });

  test('the form says what it refuses on the fields, to whoever reads it', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    await keys.newKey().click();

    await keys.labelField().focus();
    await keys.originsField().fill('http://shop.acme.test');
    await keys.originsField().press('Tab');

    await expect(keys.labelField()).toHaveAttribute('aria-invalid', 'true');
    await expect(keys.originsField()).toHaveAttribute('aria-invalid', 'true');
    await expect(keys.labelField()).toHaveAccessibleDescription(
      /Enter a label/,
    );
    await expect(keys.rejectedOrigins()).toBeVisible();
    await expectAccessibleInBothThemes(page);
  });

  test('the key shown once has no violation, names its field and holds the focus', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    await keys.newKey().click();
    await keys.fill({ label: 'Checkout' });
    await keys.createButton().click();
    await expect(keys.createdKey()).toBeVisible();

    await expect(keys.createdKey()).toHaveAccessibleName('Key Checkout');
    await expect(keys.dialog().getByRole('status')).toContainText(
      'You will not see this key again',
    );
    await expectAccessibleInBothThemes(page);
    await expectDialogAccessible(page, keys.dialog());
  });

  test('the form that changes a key has no violation and holds the focus', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    await keys.editLink('pricing').click();
    await expect(keys.labelField()).toHaveValue('pricing');

    await expectAccessibleInBothThemes(page);
    await expectDialogAccessible(page, keys.dialog());
  });

  test('the confirmation that revokes a key has no violation, holds the focus and closes on Escape', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    await keys.revokeButton('pricing').click();
    await expect(keys.confirmation()).toBeVisible();

    await expectAccessibleInBothThemes(page);
    await expectDialogAccessible(page, keys.confirmation());
    await expect(keys.row('pricing')).toContainText('Live');
  });

  test('the origins folded away are reached from the keyboard, and the button says whether they are open', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    // Storefront holds two origins only: nothing to fold. A key with many does.
    await keys.editLink('Storefront').click();
    await keys.fill({
      origins: Array.from(
        { length: 5 },
        (_, index) => `https://s${index}.acme.test`,
      ),
    });
    await keys.saveButton().click();
    await expect(keys.dialog()).toHaveCount(0);

    const more = keys
      .row('Storefront')
      .getByRole('button', { name: 'Show 2 more' });
    await more.focus();
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');

    await expect(
      keys.row('Storefront').getByRole('button', { name: 'Show fewer' }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(keys.row('Storefront')).toContainText('https://s4.acme.test');
  });
});

test.describe('accessibility of the empty list', () => {
  test('has no violation where there is no key', async ({ page }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(
      page,
      createEmptyPublishableKeysBillingModel(),
    );

    await keys.goto();
    await expect(keys.empty()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });
});
