import { expect, recordWrites, test } from '../_support/app-test';
import { expectToast } from '../_support/assertions/toast';
import { readConsoleStorage } from '../_support/assertions/storage';
import { PublishableKeysDriver } from '../_support/drivers/publishable-keys.driver';
import { startInLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import {
  createAnonymousCheckoutBillingModel,
  createPublishableKeysBillingModel,
} from './integrations.scenarios';

// The anonymous checkout of a publishable key: the switch that waits for a Turnstile site
// key and a secret, the secret that is written and never read, the badge of the list, and
// what the console says when the API refuses. Cloudflare's published test keys stand for
// a widget: never a real one.

const WRITES = /^\/api\/publishable-keys/;
const SITE_KEY = '1x00000000000000000000AA';
const SECRET = '1x0000000000000000000000000000000AA';

test.describe('the list of publishable keys, where one opens the anonymous checkout', () => {
  test('marks the live key that does, and shows neither its secret nor its site key', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());

    await keys.goto();

    await expect(keys.anonymousBadge('Checkout page')).toHaveText(
      'Anonymous checkout',
    );
    await expect(keys.row('Checkout page')).toContainText('Live');
    await expect(keys.anonymousBadge('pricing')).toHaveCount(0);
    await expect(keys.anonymousBadge('Storefront')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(SITE_KEY);
  });
});

test.describe('issuing a key that opens the anonymous checkout', () => {
  test('keeps the switch off until the site key and the secret are given, sends all three, and keeps the secret out of sight', async ({
    context,
    page,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
    await keys.goto();
    await keys.newKey().click();
    await keys.fill({
      label: 'Storefront checkout',
      origins: ['https://shop.acme.test'],
    });

    // Off by default, and it cannot be turned on without both values.
    await expect(keys.anonymousCheckout()).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(keys.anonymousCheckout()).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(keys.dialog()).toContainText(
      'every visitor of this key’s origins can start a checkout and create a customer',
    );
    await keys.siteKeyField().fill(SITE_KEY);
    await expect(keys.anonymousCheckout()).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // The secret is typed in a password field, empty, and the browser is told to forget it.
    await expect(keys.secretField()).toHaveValue('');
    await expect(keys.secretField()).toHaveAttribute('autocomplete', 'off');
    await keys.secretField().fill(SECRET);
    await expect(keys.anonymousCheckout()).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await keys.anonymousCheckout().click();
    await expect(keys.anonymousCheckout()).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await keys.createButton().click();

    await expect(keys.createdKey()).toHaveValue('pk_test_key_0001');
    expect(writes).toEqual([
      {
        body: {
          allowedOrigins: ['https://shop.acme.test'],
          anonymousCheckout: true,
          label: 'Storefront checkout',
          turnstileSecret: SECRET,
          turnstileSiteKey: SITE_KEY,
        },
        method: 'POST',
        pathname: '/api/publishable-keys',
      },
    ]);
    await expect(keys.dialog()).not.toContainText(SECRET);
    await keys.done().click();

    // The list says the key opens the checkout and shows nothing of the secret.
    await expect(keys.anonymousBadge('Storefront checkout')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(SECRET);
    expect(page.url()).not.toContain(SECRET);
    expect(await readConsoleStorage(page)).not.toContain(SECRET);
    await page.reload();
    await expect(keys.anonymousBadge('Storefront checkout')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(SECRET);
    expect(await readConsoleStorage(page)).not.toContain(SECRET);
  });

  test('sends no Turnstile member for a key that is only for the catalog', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
    await keys.goto();
    await keys.newKey().click();

    await keys.fill({ label: 'Catalog only' });
    await keys.createButton().click();

    await expect(keys.createdKey()).toBeVisible();
    expect(writes.map(({ body }) => body)).toEqual([
      { allowedOrigins: [], label: 'Catalog only' },
    ]);
  });

  test('refuses a site key that is not one, on its field', async ({ page }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
    await keys.goto();
    await keys.newKey().click();

    await keys.fill({ label: 'Storefront checkout' });
    await keys.siteKeyField().fill('not a key!');
    await keys.siteKeyField().press('Tab');

    await expect(keys.dialog()).toContainText(
      'A site key is 1 to 255 letters, digits, hyphens or underscores',
    );
    await expect(keys.siteKeyField()).toHaveAttribute('aria-invalid', 'true');
    await expect(keys.createButton()).toBeDisabled();
  });

  test('says it in the console’s words on the switch when the API refuses the checkout, and keeps what was typed', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = createAnonymousCheckoutBillingModel();
    model.publishableKeys.armProblem('createPublishableKey', {
      code: 'CreatePublishableKey.TurnstileNotConfigured',
      detail:
        'anonymousCheckout needs a Turnstile site key and a Turnstile secret',
      status: 422,
    });
    await installBillingAppMocks(page, model);
    await keys.goto();
    await keys.newKey().click();
    await keys.fill({ label: 'Storefront checkout' });
    await keys.siteKeyField().fill(SITE_KEY);
    await keys.secretField().fill(SECRET);
    await keys.anonymousCheckout().click();

    await keys.createButton().click();

    await expect(keys.dialog()).toContainText(
      'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
    );
    await expect(keys.dialog()).not.toContainText('anonymousCheckout needs');
    await expect(keys.anonymousCheckout()).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(keys.siteKeyField()).toHaveValue(SITE_KEY);
    await expect(keys.createdKey()).toHaveCount(0);
  });
});

test.describe('on a deployment with no Vault', () => {
  test('disables the secret and says the deployment cannot store it, so the switch stays off, and a key for the catalog is still issued', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(
      page,
      createAnonymousCheckoutBillingModel('vaultMissing'),
    );
    await keys.goto();
    await keys.newKey().click();

    await expect(keys.secretField()).toBeDisabled();
    await expect(keys.dialog()).toContainText(
      'Anonymous checkout needs a configured Vault: this deployment cannot store a Turnstile secret.',
    );
    await keys.siteKeyField().fill(SITE_KEY);
    await expect(keys.anonymousCheckout()).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await keys.fill({ label: 'Catalog only' });
    await keys.createButton().click();

    await expect(keys.createdKey()).toBeVisible();
  });

  test('says plainly on the secret that the deployment cannot store it when the API refuses, and keeps the form', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    // The console reads a Vault there: the refusal is what it gets when it is wrong.
    const model = createAnonymousCheckoutBillingModel();
    model.publishableKeys.armProblem('createPublishableKey', {
      code: 'CreatePublishableKey.VaultNotConfigured',
      detail:
        'The Turnstile secret is stored in Vault, and this deployment has none configured: set VAULT_ADDR',
      status: 422,
    });
    await installBillingAppMocks(page, model);
    await keys.goto();
    await keys.newKey().click();
    await keys.fill({ label: 'Storefront checkout' });
    await keys.siteKeyField().fill(SITE_KEY);
    await keys.secretField().fill(SECRET);

    await keys.createButton().click();

    await expect(keys.dialog()).toContainText(
      'This deployment has no Vault, so it cannot store a Turnstile secret.',
    );
    await expect(keys.secretField()).toHaveAttribute('aria-invalid', 'true');
    await expect(keys.siteKeyField()).toHaveValue(SITE_KEY);
    await expect(keys.createdKey()).toHaveCount(0);
  });

  test('is refused by the model of the API exactly as the form foresees', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = createAnonymousCheckoutBillingModel('vaultMissing');
    await installBillingAppMocks(page, model);
    await keys.goto();

    const refused = await page.evaluate(async () => {
      const response = await fetch('/api/publishable-keys', {
        body: JSON.stringify({
          allowedOrigins: [],
          label: 'direct',
          turnstileSecret: 'secret',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      return {
        code: ((await response.json()) as { code?: string }).code,
        status: response.status,
      };
    });

    expect(refused).toEqual({
      code: 'CreatePublishableKey.VaultNotConfigured',
      status: 422,
    });
  });
});

test.describe('changing a key that opens the anonymous checkout', () => {
  test('opens with the switch on, the site key, and a secret that is stored and never shown', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
    await keys.goto();

    await keys.editLink('Checkout page').click();

    await expect(keys.anonymousCheckout()).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(keys.siteKeyField()).toHaveValue(SITE_KEY);
    await expect(keys.secretStatus()).toHaveText(
      'A secret is stored for this key. It is never shown.',
    );
    await expect(keys.secretField()).toHaveCount(0);
    await expect(keys.replaceSecret()).toBeVisible();
    await expect(keys.removeSecret()).toBeVisible();
  });

  test('sends no site key and no secret when only the label changes, so the secret stays stored', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
    await keys.goto();
    await keys.editLink('Checkout page').click();

    await keys.fill({ label: 'Checkout page v2' });
    await keys.saveButton().click();

    await expect(keys.dialog()).toHaveCount(0);
    expect(writes).toEqual([
      {
        body: {
          allowedOrigins: ['https://checkout.acme.test'],
          label: 'Checkout page v2',
        },
        method: 'PATCH',
        pathname: '/api/publishable-keys/pk-checkout',
      },
    ]);
    await expectToast(page, 'Checkout page v2 saved');
    await expect(keys.anonymousBadge('Checkout page v2')).toBeVisible();
    // Reopened, the key still has its secret.
    await keys.editLink('Checkout page v2').click();
    await expect(keys.secretStatus()).toBeVisible();
  });

  test('replaces the secret: a field to type it in, empty, and the secret sent alone', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
    await keys.goto();
    await keys.editLink('Checkout page').click();

    await keys.replaceSecret().click();

    await expect(keys.secretField()).toHaveValue('');
    await expect(keys.secretField()).toBeFocused();
    // An empty replacement says nothing: it cannot be saved.
    await keys.secretField().fill('x');
    await keys.secretField().fill('');
    await expect(keys.dialog()).toContainText(
      'Enter the new secret, or keep the current one',
    );
    await expect(keys.saveButton()).toBeDisabled();
    await keys.secretField().fill(SECRET);
    await keys.saveButton().click();

    await expect(keys.dialog()).toHaveCount(0);
    expect(writes.map(({ body }) => body)).toEqual([
      {
        allowedOrigins: ['https://checkout.acme.test'],
        label: 'Checkout page',
        turnstileSecret: SECRET,
      },
    ]);
    await expect(page.locator('body')).not.toContainText(SECRET);
    expect(await readConsoleStorage(page)).not.toContain(SECRET);
  });

  test('will not remove the secret of a key that still opens the checkout, and removes it once the checkout is off', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
    await keys.goto();
    await keys.editLink('Checkout page').click();

    await keys.removeSecret().click();

    await expect(keys.secretStatus()).toHaveText(
      'The secret will be removed when you save, but anonymous checkout needs one. Keep the secret, or turn anonymous checkout off.',
    );
    await expect(keys.dialog()).toContainText(
      'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
    );
    await expect(keys.saveButton()).toBeDisabled();

    await keys.anonymousCheckout().click();
    await expect(keys.secretStatus()).toHaveText(
      'The secret will be removed when you save.',
    );
    await expect(keys.saveButton()).toBeEnabled();
    await keys.saveButton().click();

    await expect(keys.dialog()).toHaveCount(0);
    expect(writes.map(({ body }) => body)).toEqual([
      {
        allowedOrigins: ['https://checkout.acme.test'],
        anonymousCheckout: false,
        label: 'Checkout page',
        turnstileSecret: '',
      },
    ]);
    await expect(keys.anonymousBadge('Checkout page')).toHaveCount(0);
    await keys.editLink('Checkout page').click();
    await expect(keys.secretField()).toHaveValue('');
    await expect(keys.anonymousCheckout()).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('turns the checkout on for a key that has neither value once both are given', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
    await keys.goto();
    await keys.editLink('pricing').click();

    await expect(keys.anonymousCheckout()).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await keys.siteKeyField().fill(SITE_KEY);
    await keys.secretField().fill(SECRET);
    await keys.anonymousCheckout().click();
    await keys.saveButton().click();

    await expect(keys.dialog()).toHaveCount(0);
    expect(writes.map(({ body }) => body)).toEqual([
      {
        allowedOrigins: ['https://shop.acme.test'],
        anonymousCheckout: true,
        label: 'pricing',
        turnstileSecret: SECRET,
        turnstileSiteKey: SITE_KEY,
      },
    ]);
    await expect(keys.anonymousBadge('pricing')).toBeVisible();
  });

  test('clears the site key with an empty value once the checkout is off', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
    await keys.goto();
    await keys.editLink('Checkout page').click();

    await keys.siteKeyField().fill('');
    await expect(keys.dialog()).toContainText(
      'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
    );
    await keys.anonymousCheckout().click();
    await keys.saveButton().click();

    await expect(keys.dialog()).toHaveCount(0);
    expect(writes.map(({ body }) => body)).toEqual([
      {
        allowedOrigins: ['https://checkout.acme.test'],
        anonymousCheckout: false,
        label: 'Checkout page',
        turnstileSiteKey: '',
      },
    ]);
  });

  test('says it in the console’s words on the switch when the API refuses a key left without a value', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = createAnonymousCheckoutBillingModel();
    model.publishableKeys.armProblem('updatePublishableKey', {
      code: 'UpdatePublishableKey.TurnstileNotConfigured',
      detail:
        'anonymousCheckout needs a Turnstile site key and a Turnstile secret',
      status: 422,
    });
    await installBillingAppMocks(page, model);
    await keys.goto();
    await keys.editLink('Checkout page').click();

    await keys.fill({ label: 'Checkout page v2' });
    await keys.saveButton().click();

    await expect(keys.dialog()).toContainText(
      'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
    );
    await expect(keys.dialog()).not.toContainText('anonymousCheckout needs');
    await expect(page).toHaveURL(
      '/integrations/publishable-keys/pk-checkout/edit',
    );
  });

  test('says a key that was revoked in the meantime can no longer change, whatever Turnstile said', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = createAnonymousCheckoutBillingModel();
    model.publishableKeys.armProblem('updatePublishableKey', {
      code: 'UpdatePublishableKey.Revoked',
      detail: 'a revoked publishable key cannot be changed',
      status: 409,
    });
    await installBillingAppMocks(page, model);
    await keys.goto();
    await keys.editLink('Checkout page').click();

    await keys.fill({ label: 'Checkout page v2' });
    await keys.saveButton().click();

    await expect(keys.dialog()).toContainText('create a new key instead');
  });
});

test.describe('the anonymous checkout of a key, read in French', () => {
  test('the list, the form of a key and what it refuses', async ({ page }) => {
    await startInLanguage(page, 'fr');
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
    await page.goto('/integrations/publishable-keys');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Clés publiables' }),
    ).toBeVisible();
    await expect(keys.anonymousBadge('Checkout page')).toHaveText(
      'Paiement anonyme',
    );
    await page.getByRole('link', { name: 'Modifier Checkout page' }).click();
    await expect(keys.dialog()).toContainText('Paiement anonyme');
    await expect(keys.secretStatus()).toHaveText(
      'Un secret est stocké pour cette clé. Il n’est jamais affiché.',
    );
    await keys.removeSecret().click();
    await expect(keys.secretStatus()).toHaveText(
      'Le secret sera retiré à l’enregistrement, mais le paiement anonyme en a besoin. Gardez le secret, ou désactivez le paiement anonyme.',
    );
    await expect(keys.dialog()).toContainText(
      'Le paiement anonyme nécessite une clé de site et un secret. Renseignez les deux, ou désactivez-le.',
    );
  });

  test('says the refusal of the API in French, not in its developer words', async ({
    page,
  }) => {
    await startInLanguage(page, 'fr');
    const keys = new PublishableKeysDriver(page);
    const model = createAnonymousCheckoutBillingModel();
    model.publishableKeys.armProblem('updatePublishableKey', {
      code: 'UpdatePublishableKey.TurnstileNotConfigured',
      detail:
        'anonymousCheckout needs a Turnstile site key and a Turnstile secret',
      status: 422,
    });
    await installBillingAppMocks(page, model);
    await page.goto('/integrations/publishable-keys');
    await page.getByRole('link', { name: 'Modifier Checkout page' }).click();

    await keys.fill({ label: 'Checkout page v2' });
    await keys.dialog().getByRole('button', { name: 'Enregistrer' }).click();

    await expect(keys.dialog()).toContainText(
      'Le paiement anonyme nécessite une clé de site et un secret. Renseignez les deux, ou désactivez-le.',
    );
    await expect(keys.dialog()).not.toContainText('anonymousCheckout needs');
  });
});

test.describe('the publishable keys without the anonymous checkout', () => {
  test('lists no badge and keeps the form of the catalog keys as it was', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
    await keys.goto();

    await expect(page.getByTestId('anonymous-checkout-badge')).toHaveCount(0);
    await keys.editLink('pricing').click();
    await expect(keys.anonymousCheckout()).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
