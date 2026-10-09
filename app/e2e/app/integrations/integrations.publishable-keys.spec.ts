import { expect, recordWrites, test } from '../_support/app-test';
import { expectToast } from '../_support/assertions/toast';
import { readConsoleStorage } from '../_support/assertions/storage';
import { PublishableKeysDriver } from '../_support/drivers/publishable-keys.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { BillingAppModel } from '../_support/model/billing-app-model';
import {
  billingCapabilitiesProfiles,
  NO_BILLING_FEATURES,
} from '../_support/model/billing-capabilities';
import {
  createEmptyPublishableKeysBillingModel,
  createPublishableKeysBillingModel,
  PUBLISHABLE_KEYS,
} from './integrations.scenarios';

// The publishable keys a web page reads the public catalogue with: listed by their last four
// characters, issued once, edited and revoked. The console shows them on billing alone, with
// the capabilities the API serves now (`publicSurface` shipped and enabled), and never has a key but the
// one it is shown at the moment it is issued.

const WRITES = /^\/api\/publishable-keys/;

test.describe('the list of publishable keys', () => {
  test('lists the live keys with what tells them apart, and never a key', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());

    await keys.goto();

    await expect(keys.rows()).toHaveCount(3);
    const pricing = keys.row('pricing');
    await expect(pricing).toContainText('…a1B2');
    await expect(pricing).toContainText('https://shop.acme.test');
    await expect(pricing).toContainText('Live');
    await expect(pricing).toContainText('Oct 6, 2026');
    await expect(keys.row('Storefront')).toContainText('http://localhost:5173');
    await expect(keys.row('Storefront')).toContainText('Never used');
    await expect(keys.row('Legacy checkout')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('pk_');
  });

  test('says what a key is for, and leads to the switches that decide what it lists', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());

    await keys.goto();

    await expect(keys.intro()).toContainText('X-Kaiten-Publishable-Key');
    await expect(keys.intro()).toContainText('GET /public/catalog');
    await expect(
      keys.intro().getByRole('link', { name: 'License families' }),
    ).toHaveAttribute('href', '/catalog/licenses');
    // This release ships no add-ons on the stack's capabilities: no way to their switch.
    await expect(
      keys.intro().getByRole('link', { name: 'Add-on families' }),
    ).toHaveCount(0);
  });

  test('stands whatever the capabilities say of the public surface', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = new BillingAppModel({
      capabilities: {
        ...billingCapabilitiesProfiles.stack(),
        features: NO_BILLING_FEATURES,
        publicSurface: { enabled: false },
      },
      publishableKeys: { keys: PUBLISHABLE_KEYS },
    });
    await installBillingAppMocks(page, model);

    // The page asks billing to be on and the session for its scopes: neither flag
    // of the public surface is part of that, so a release that says both are off
    // still shows the keys.
    expect(model.getCapabilities().features.publicSurface).toBe(false);
    expect(model.getCapabilities().publicSurface.enabled).toBe(false);
    await keys.goto();

    await expect(keys.rows()).toHaveCount(3);
  });

  test('lists the revoked keys on request, as revoked and with no action, and the URL says so', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    const reads = recordWrites(page, WRITES, ['GET']);

    await keys.goto();
    await expect(keys.includeRevoked()).not.toBeChecked();

    await keys.includeRevoked().click();

    await expect(keys.row('Legacy checkout')).toBeVisible();
    await expect(page).toHaveURL(/\?includeRevoked=true$/);
    await expect(keys.row('Legacy checkout')).toContainText('Revoked');
    await expect(keys.row('Legacy checkout')).toContainText('…z9Y8');
    await expect(keys.editLink('Legacy checkout')).toHaveCount(0);
    await expect(keys.revokeButton('Legacy checkout')).toHaveCount(0);
    expect(reads.map(({ search }) => search)).toEqual([
      undefined,
      '?includeRevoked=true',
    ]);

    await keys.includeRevoked().click();

    await expect(keys.row('Legacy checkout')).toHaveCount(0);
    await expect(page).not.toHaveURL(/includeRevoked/);
  });

  test('opens with the revoked keys when the link asks for them', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());

    await keys.goto('?includeRevoked=true');

    await expect(keys.includeRevoked()).toBeChecked();
    await expect(keys.rows()).toHaveCount(4);
  });

  test('searches by label, by the end of a key and by origin', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto();

    await keys.searchField().fill('c3D4');
    await expect(keys.rows()).toHaveCount(1);
    await expect(keys.row('Storefront')).toBeVisible();

    await keys.searchField().fill('docs.acme');
    await expect(keys.rows()).toHaveCount(1);
    await expect(keys.row('Docs')).toBeVisible();

    await keys.searchField().fill('nothing like it');
    await expect(keys.filteredEmpty()).toBeVisible();
  });

  test('says where a key comes from when there is none, with the way to issue one', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(
      page,
      createEmptyPublishableKeysBillingModel(),
    );

    await keys.goto();

    await expect(keys.empty()).toContainText('No publishable key yet');
    await expect(
      keys.empty().getByRole('link', { name: 'New publishable key' }),
    ).toBeVisible();
  });

  test('says why the keys cannot be read, in the words of the API', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = createPublishableKeysBillingModel();
    model.publishableKeys.armProblem('listPublishableKeys', {
      code: 'Auth.MissingScope',
      detail: 'missing required scope: read:publishable_keys',
      status: 403,
    });
    await installBillingAppMocks(page, model);

    await page.goto('/integrations/publishable-keys');

    await expect(page.getByText('read:publishable_keys').first()).toBeVisible();
    await expect(keys.rows()).toHaveCount(0);
  });
});

test.describe('issuing a publishable key', () => {
  test('refuses what is no origin, names it, takes the others, and shows the key once with a way to copy it', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto();

    await keys.newKey().click();
    await expect(page).toHaveURL('/integrations/publishable-keys/new');
    await expect(keys.dialog()).toContainText('New publishable key');
    // The list stays under the dialog.
    await expect(keys.rowBehindDialog('pricing')).toBeVisible();

    // An empty label, then the origins: an http origin and a path are refused.
    await keys.labelField().focus();
    await keys.originsField().fill('http://shop.acme.test');
    await keys.originsField().press('Tab');
    await expect(keys.dialog()).toContainText('Enter a label');
    await expect(keys.rejectedOrigins()).toHaveText(
      'Not an origin: http://shop.acme.test',
    );
    await keys.fill({
      label: 'Checkout',
      origins: ['https://shop.acme.test/'],
    });
    await expect(keys.rejectedOrigins()).toHaveText(
      'Not an origin: https://shop.acme.test/',
    );
    await expect(keys.createButton()).toBeDisabled();

    await keys.fill({
      origins: ['http://localhost:5173', 'https://shop.acme.test'],
    });
    await expect(keys.rejectedOrigins()).toHaveCount(0);
    await keys.createButton().click();

    await expect(keys.createdKey()).toHaveValue('pk_test_key_0001');
    expect(writes).toEqual([
      {
        body: {
          allowedOrigins: ['http://localhost:5173', 'https://shop.acme.test'],
          label: 'Checkout',
        },
        method: 'POST',
        pathname: '/api/publishable-keys',
      },
    ]);
    await expect(keys.dialog()).toContainText(
      'You will not see this key again',
    );
    await expect(keys.dialog()).toContainText('0001');
    await keys.copyKey().click();
    await expectToast(page, 'Key copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'pk_test_key_0001',
    );
    // It is in the dialog and in the clipboard, and nowhere else.
    expect(page.url()).not.toContain('pk_test_key_0001');
    expect(await readConsoleStorage(page)).not.toContain('pk_test_key_0001');

    await keys.done().click();

    await expect(page).toHaveURL('/integrations/publishable-keys');
    await expect(keys.dialog()).toHaveCount(0);
    await expect(keys.rows()).toHaveCount(4);
    // The list shows "…" and the last four characters, never the key.
    await expect(keys.row('Checkout')).toContainText('…0001');
    await expect(page.locator('body')).not.toContainText('pk_test_key_0001');

    await page.reload();

    await expect(keys.rows()).toHaveCount(4);
    await expect(page.locator('body')).not.toContainText('pk_test_key_0001');
    expect(await readConsoleStorage(page)).not.toContain('pk_test_key_0001');
  });

  test('refuses a fifty-first origin inline, and sends nothing', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto();
    await keys.newKey().click();

    await keys.fill({
      label: 'pricing',
      origins: Array.from(
        { length: 51 },
        (_, index) => `https://s${index}.acme.test`,
      ),
    });
    await keys.originsField().press('Tab');

    await expect(keys.dialog()).toContainText(
      'That is too many origins for one key',
    );
    await expect(keys.createButton()).toBeDisabled();

    await keys.fill({
      origins: Array.from(
        { length: 50 },
        (_, index) => `https://s${index}.acme.test`,
      ),
    });
    await expect(keys.createButton()).toBeEnabled();
    expect(writes).toEqual([]);
  });

  test('shows what the API refused on the field it is about, and keeps what was typed', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = createPublishableKeysBillingModel();
    model.publishableKeys.armProblem('createPublishableKey', {
      code: 'CreatePublishableKey.InvalidOrigin',
      detail:
        '"https://exa.mple" is not an origin: expected https://host[:port], or http://localhost[:port]',
      status: 422,
    });
    await installBillingAppMocks(page, model);
    await keys.goto();
    await keys.newKey().click();

    await keys.fill({ label: 'pricing', origins: ['https://exa.mple'] });
    await keys.createButton().click();

    await expect(keys.dialog()).toContainText(
      '"https://exa.mple" is not an origin: expected https://host[:port], or http://localhost[:port]',
    );
    await expect(keys.labelField()).toHaveValue('pricing');
    await expect(keys.createdKey()).toHaveCount(0);
    await expect(page).toHaveURL('/integrations/publishable-keys/new');
  });

  test('asks before a key that was not copied is dismissed, and lets a copied one go', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto();
    await keys.newKey().click();
    await keys.fill({ label: 'Checkout' });
    await keys.createButton().click();
    await expect(keys.createdKey()).toHaveValue('pk_test_key_0001');

    // Escape is a gesture that can be made by accident: the key is the only copy.
    await page.keyboard.press('Escape');
    await expect(keys.leaveQuestion()).toBeVisible();
    await keys
      .leaveQuestion()
      .getByRole('button', { name: 'Back to the key' })
      .click();
    await expect(keys.leaveQuestion()).toHaveCount(0);
    await expect(keys.createdKey()).toHaveValue('pk_test_key_0001');
    await expect(page).toHaveURL('/integrations/publishable-keys/new');

    await keys.copyKey().click();
    await expectToast(page, 'Key copied');
    await page.keyboard.press('Escape');

    await expect(keys.dialog()).toHaveCount(0);
    await expect(page).toHaveURL('/integrations/publishable-keys');
    await expect(page.locator('body')).not.toContainText('pk_test_key_0001');
  });

  test('closes without the key once the person says so', async ({ page }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto();
    await keys.newKey().click();
    await keys.fill({ label: 'Checkout' });
    await keys.createButton().click();
    await expect(keys.createdKey()).toBeVisible();

    await keys.dialog().getByRole('button', { name: 'Close' }).click();
    await keys
      .leaveQuestion()
      .getByRole('button', { name: 'Close without copying' })
      .click();

    await expect(keys.dialog()).toHaveCount(0);
    await expect(page).toHaveURL('/integrations/publishable-keys');
    await expect(page.locator('body')).not.toContainText('pk_test_key_0001');
  });

  test('opens from its address, and closing it leads back to the list, with the revoked keys as they were', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());

    await page.goto('/integrations/publishable-keys/new?includeRevoked=true');
    await expect(keys.dialog()).toContainText('New publishable key');
    await expect(keys.rowBehindDialog('Legacy checkout')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(keys.dialog()).toHaveCount(0);
    await expect(page).toHaveURL(
      '/integrations/publishable-keys?includeRevoked=true',
    );
    await expect(keys.row('Legacy checkout')).toBeVisible();
  });
});

test.describe('changing a publishable key', () => {
  test('edits the label and the origins of a key, and the list shows them, never the key', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto();

    await keys.editLink('pricing').click();

    await expect(page).toHaveURL('/integrations/publishable-keys/pk-1/edit');
    await expect(keys.dialog()).toContainText('Edit pricing');
    await expect(keys.labelField()).toHaveValue('pricing');
    await expect(keys.originsField()).toHaveValue('https://shop.acme.test');
    await keys.fill({
      label: 'pricing page',
      origins: ['https://shop.acme.test', 'https://portal.acme.test'],
    });
    await keys.saveButton().click();

    await expect(keys.dialog()).toHaveCount(0);
    await expect(page).toHaveURL('/integrations/publishable-keys');
    expect(writes).toEqual([
      {
        body: {
          allowedOrigins: [
            'https://shop.acme.test',
            'https://portal.acme.test',
          ],
          label: 'pricing page',
        },
        method: 'PATCH',
        pathname: '/api/publishable-keys/pk-1',
      },
    ]);
    await expectToast(page, 'pricing page saved');
    const row = keys.row('pricing page');
    await expect(row).toContainText('https://portal.acme.test');
    await expect(row).toContainText('…a1B2');
    await expect(page.locator('body')).not.toContainText('pk_');
  });

  test('empties the origins of a key, which allows no browser origin', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto();

    await keys.editLink('Docs').click();
    await keys.fill({ origins: [] });
    await keys.saveButton().click();

    await expect(keys.dialog()).toHaveCount(0);
    expect(writes.map(({ body }) => body)).toEqual([
      { allowedOrigins: [], label: 'Docs' },
    ]);
    await expect(keys.row('Docs')).toContainText('No browser origin');
  });

  test('offers no edit of a revoked key, and leads its address back to the list', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());

    await keys.goto('?includeRevoked=true');
    await expect(keys.row('Legacy checkout')).toBeVisible();
    await expect(keys.editLink('Legacy checkout')).toHaveCount(0);

    await page.goto('/integrations/publishable-keys/pk-2/edit');

    await expect(page).toHaveURL('/integrations/publishable-keys');
    await expect(keys.dialog()).toHaveCount(0);
  });

  test('says a key that was revoked in the meantime can no longer change', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = createPublishableKeysBillingModel();
    model.publishableKeys.armProblem('updatePublishableKey', {
      code: 'UpdatePublishableKey.Revoked',
      detail: 'a revoked publishable key cannot be changed',
      status: 409,
    });
    await installBillingAppMocks(page, model);
    await keys.goto();
    await keys.editLink('pricing').click();

    await keys.fill({ label: 'pricing page' });
    await keys.saveButton().click();

    await expect(keys.dialog()).toContainText(
      'a revoked publishable key cannot be changed',
    );
    await expect(keys.dialog()).toContainText('create a new key instead');
    await expect(page).toHaveURL('/integrations/publishable-keys/pk-1/edit');
  });

  test('shows what the API refused of an origin the console let through', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = createPublishableKeysBillingModel();
    model.publishableKeys.armProblem('updatePublishableKey', {
      code: 'UpdatePublishableKey.InvalidOrigin',
      detail: '"https://exa.mple" is not an origin',
      status: 422,
    });
    await installBillingAppMocks(page, model);
    await keys.goto();
    await keys.editLink('pricing').click();

    await keys.fill({ origins: ['https://exa.mple'] });
    await keys.saveButton().click();

    await expect(keys.dialog()).toContainText(
      '"https://exa.mple" is not an origin',
    );
    await expect(keys.originsField()).toHaveValue('https://exa.mple');
  });

  test('answers the address of a key there is not with the page that does not exist', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createPublishableKeysBillingModel());

    await page.goto('/integrations/publishable-keys/ghost/edit');

    await expect(page.getByText('Page not found')).toBeVisible();
  });
});

test.describe('revoking a publishable key', () => {
  test('asks first, then revokes the key for good, and says so', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto('?includeRevoked=true');

    await keys.revokeButton('Docs').click();

    await expect(keys.confirmation()).toContainText('Revoke Docs?');
    await expect(keys.confirmation()).toContainText('cannot be restored');
    expect(writes).toEqual([]);

    await keys.confirmRevoke().click();

    await expect(keys.confirmation()).toHaveCount(0);
    expect(writes).toEqual([
      {
        body: null,
        method: 'POST',
        pathname: '/api/publishable-keys/pk-docs/revoke',
      },
    ]);
    await expectToast(page, 'Docs revoked');
    await expect(keys.row('Docs')).toContainText('Revoked');
    await expect(keys.revokeButton('Docs')).toHaveCount(0);
    await expect(keys.editLink('Docs')).toHaveCount(0);
  });

  test('takes the key off the list when the revoked keys are not listed, and says so', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto();

    await keys.revokeButton('Docs').click();
    await keys.confirmRevoke().click();

    await expectToast(page, 'Docs revoked');
    await expect(keys.row('Docs')).toHaveCount(0);
    await keys.includeRevoked().click();
    await expect(keys.row('Docs')).toContainText('Revoked');
  });

  test('changes nothing when the confirmation is cancelled', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto();

    await keys.revokeButton('Docs').click();
    await keys.confirmation().getByRole('button', { name: 'Cancel' }).click();

    await expect(keys.confirmation()).toHaveCount(0);
    await expect(keys.row('Docs')).toContainText('Live');
    expect(writes).toEqual([]);
  });

  test('keeps the confirmation open with the words of the API when it refuses', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = createPublishableKeysBillingModel();
    model.publishableKeys.armProblem('revokePublishableKey', {
      code: 'RevokePublishableKey.NotFound',
      detail: 'publishable key pk-docs not found',
      status: 404,
    });
    await installBillingAppMocks(page, model);
    await keys.goto();

    await keys.revokeButton('Docs').click();
    await keys.confirmRevoke().click();

    await expect(keys.confirmation()).toContainText(
      'publishable key pk-docs not found',
    );
    await keys.confirmation().getByRole('button', { name: 'Cancel' }).click();
    await expect(keys.row('Docs')).toContainText('Live');
  });
});
