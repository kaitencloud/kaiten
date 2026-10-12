import type { Page } from '@playwright/test';
import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { StripeConnectorDriver } from '../_support/drivers/stripe-connector.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installConnectorAppMocks } from '../_support/mocks/install-connector-app-mocks';
import { signInWithScopes } from '../_support/session-scopes';
import { createBillingDisabledModel } from '../billing/billing.scenarios';
import { ConnectorAppModel } from '../_support/model/connector-app-model';
import { createStripeConnectorModels } from './connectors.scenarios';

// The connector of Stripe is the one connector of billing: its tile on the page of the
// connectors, and its own page, where the restricted key of the Stripe account is typed
// once and never read back, the options of the invoices are chosen, and the connection
// is ended. Where it stands (connected to a test or a live account, free to be, or kept
// out by the plan or by a deployment without a Vault) is what the capabilities of billing
// list, and the settings of the connector are the API's generic ones.

const SETTINGS =
  /\/api\/connectors\/kaiten\.integration\.billing\.stripe\/settings$/;
const DEACTIVATION =
  /\/api\/connectors\/kaiten\.integration\.billing\.stripe\/activation$/;

/** Billing says where Stripe stands, and the connectors hold the key and the options. */
async function install(
  page: Page,
  models: ReturnType<typeof createStripeConnectorModels>,
) {
  await installBillingAppMocks(page, models.billing);
  await installConnectorAppMocks(page, models.connectors);
}

test.describe('the Stripe tile of the connectors', () => {
  test('is listed under Billing as available, and leads to the page of the connector', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'available' }));

    await stripe.gotoIndex();

    await expect(
      stripe.section('Billing').getByText('Stripe', { exact: true }),
    ).toBeVisible();
    await expect(stripe.tile()).toContainText('Available');
    await expect(stripe.tile()).toContainText('Subscription billing');
    await stripe.tile().getByRole('button', { name: 'Connect' }).click();

    await expect(page).toHaveURL(/\/integrations\/connectors\/stripe$/);
    await expect(stripe.title()).toBeVisible();
    await expect(stripe.keyField()).toBeVisible();
  });

  test('keeps Lago a tile that is coming and cannot be opened, and sends it and any other unknown connector back to the list', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'available' }));

    await stripe.gotoIndex();
    await expect(stripe.tile('Lago')).toContainText('Coming H1');
    await expect(
      stripe.tile('Lago').getByRole('button', { name: 'Connect' }),
    ).toBeDisabled();

    for (const connector of ['lago', 'unknown']) {
      await page.goto(`/integrations/connectors/${connector}`);

      await expect(page).toHaveURL(/\/integrations\/connectors\/?$/);
      await expect(
        page.getByRole('heading', { name: 'Connectors' }),
      ).toBeVisible();
    }
  });

  test('moves to the connected ones once Stripe is connected, with the way to manage it', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.gotoIndex();

    const connected = stripe.section(/^Connected \(/);
    await expect(connected.getByText('Stripe', { exact: true })).toBeVisible();
    await expect(stripe.tile()).toContainText('Connected');
    await stripe.tile().getByRole('button', { name: 'Manage' }).click();

    await expect(page).toHaveURL(/\/integrations\/connectors\/stripe$/);
    await expect(stripe.modeBadge()).toHaveText('Test mode');
  });

  test('says under its name that the plan leaves it out, and cannot be opened', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(
      page,
      createStripeConnectorModels({ standing: 'notEntitled' }),
    );

    await stripe.gotoIndex();

    await expect(stripe.tile()).toContainText('Not included in your plan');
    await expect(stripe.tile()).toContainText('Unavailable');
    await expect(
      stripe.tile().getByRole('button', { name: 'Connect' }),
    ).toBeDisabled();
  });

  test('says under its name that the deployment needs a Vault, and cannot be opened', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(
      page,
      createStripeConnectorModels({ standing: 'vaultMissing' }),
    );

    await stripe.gotoIndex();

    await expect(stripe.tile()).toContainText(
      'Stripe needs a configured Vault',
    );
    await expect(stripe.tile()).toContainText('Unavailable');
    await expect(
      stripe.tile().getByRole('button', { name: 'Connect' }),
    ).toBeDisabled();
  });
});

test.describe('the key of the Stripe connector', () => {
  test('opens empty and says there is one on file, is typed as a password, and is sent with the options and cleared once saved', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    const writes = recordWrites(page, SETTINGS, ['PUT']);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();

    await expect(stripe.standingBadge()).toHaveText('Connected');
    await expect(stripe.modeBadge()).toHaveText('Test mode');
    await expect(stripe.keyField()).toHaveAttribute('type', 'password');
    await expect(stripe.keyField()).toHaveValue('');
    await expect(stripe.keyField()).toHaveAttribute(
      'placeholder',
      'Key set (Test mode) — enter a new key to replace it',
    );
    // The options as they are stored.
    await expect(stripe.taxBehavior()).toContainText('Amounts exclude tax');
    await expect(stripe.automaticTax()).not.toBeChecked();
    await expect(stripe.autoFinalize()).toBeChecked();
    await expect(stripe.saveButton('Save changes')).toBeDisabled();

    await stripe.saveKey('rk_test_123');

    await expectToast(page, 'Stripe settings saved.');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toEqual({
      settings: {
        autoFinalize: true,
        automaticTax: false,
        stripeSecretKey: 'rk_test_123',
        taxBehavior: 'EXCLUSIVE',
      },
    });
    // The key was typed once: nothing of it is left on the page.
    await expect(stripe.keyField()).toHaveValue('');
    await expect(page.getByText('rk_test_123')).toHaveCount(0);
  });

  test('keeps the key that is stored when only an option changes, and sends none', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    const writes = recordWrites(page, SETTINGS, ['PUT']);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await stripe.automaticTax().check();
    await stripe.autoFinalize().uncheck();
    await stripe.saveButton('Save changes').click();

    await expectToast(page, 'Stripe settings saved.');
    expect(writes[0].body).toEqual({
      settings: {
        autoFinalize: false,
        automaticTax: true,
        taxBehavior: 'EXCLUSIVE',
      },
    });
    await expect(stripe.automaticTax()).toBeChecked();
    await expect(stripe.autoFinalize()).not.toBeChecked();
  });

  test('refuses a secret key or a publishable one in words, before anything is sent', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    const writes = recordWrites(page, SETTINGS, ['PUT']);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await stripe.keyField().fill('sk_live_x');
    await stripe.keyField().blur();

    await expect(
      stripe.settings().getByText(/^Use a restricted key \(rk_…\)/),
    ).toBeVisible();
    await expect(stripe.saveButton('Save changes')).toBeDisabled();

    await stripe.keyField().fill('pk_test_x');
    await stripe.keyField().blur();

    await expect(
      stripe.settings().getByText(/^A publishable key \(pk_…\) cannot create/),
    ).toBeVisible();

    await stripe.keyField().fill('rk_test_x');

    await expect(stripe.settings().getByText(/^A publishable key/)).toHaveCount(
      0,
    );
    await expect(stripe.saveButton('Save changes')).toBeEnabled();
    expect(writes).toHaveLength(0);
  });

  test('says which account the key being typed reaches, before it is sent', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'available' }));

    await stripe.goto();
    await expect(stripe.keyField()).toHaveAttribute('placeholder', 'rk_test_…');
    await expect(stripe.saveButton('Connect Stripe')).toBeDisabled();

    await stripe.keyField().fill('rk_live_key');

    await expect(
      stripe
        .settings()
        .getByText('This key reaches a Stripe account in Live mode.'),
    ).toBeVisible();
    await expect(stripe.saveButton('Connect Stripe')).toBeEnabled();
  });

  test('connects Stripe for the first time with a key, and billing then lists it as connected to a live account', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    const writes = recordWrites(page, SETTINGS, ['PUT']);
    await install(page, createStripeConnectorModels({ standing: 'available' }));

    await stripe.goto();
    await expect(stripe.standingBadge()).toHaveText('Available');
    await stripe.saveKey('rk_live_key', 'Connect Stripe');

    await expectToast(page, 'Stripe connected.');
    expect(writes[0].body).toEqual({
      settings: {
        autoFinalize: true,
        automaticTax: false,
        stripeSecretKey: 'rk_live_key',
        taxBehavior: 'EXCLUSIVE',
      },
    });
    await expect(stripe.standingBadge()).toHaveText('Connected');
    await expect(stripe.modeBadge()).toHaveText('Live mode');
    await expect(stripe.saveButton('Save changes')).toBeDisabled();
    await expect(stripe.keyField()).toHaveAttribute(
      'placeholder',
      'Key set (Live mode) — enter a new key to replace it',
    );

    // Billing reads the same connection: its settings list Stripe as connected.
    await page.goto('/settings/billing');
    const provider = page.getByTestId('billing-provider-stripe');
    await expect(provider).toContainText('Connected');
    await expect(provider).toContainText('Live mode');
  });
});

test.describe('a refusal of the Stripe connector', () => {
  test('shows the credentials Stripe rejected on the key field, with what was typed kept and the connection unchanged', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await stripe.saveKey('rk_test_rejected1');

    await expect(
      stripe
        .settings()
        .getByText(
          'the payment provider refused the credentials: Invalid API Key provided',
        ),
    ).toBeVisible();
    await expect(stripe.keyField()).toHaveValue('rk_test_rejected1');
    await expect(stripe.keyField()).toHaveAttribute('aria-invalid', 'true');
    await expect(stripe.standingBadge()).toHaveText('Connected');
    await expect(stripe.modeBadge()).toHaveText('Test mode');

    // Typing another key takes the refusal back.
    await stripe.keyField().fill('rk_test_other1');

    await expect(
      stripe.settings().getByText(/refused the credentials/),
    ).toHaveCount(0);
  });

  test('shows a Stripe that cannot be reached above the button as a refusal that changed nothing, and sends again when asked', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    const writes = recordWrites(page, SETTINGS, ['PUT']);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await stripe.saveKey('rk_test_offline');

    const alert = stripe.settings().getByRole('alert');
    await expect(alert).toContainText(
      'the payment provider could not be reached to check the credentials',
    );
    await expect(alert).toContainText(
      'The payment provider could not be reached',
    );
    await alert.getByRole('button', { name: 'Retry' }).click();

    await expect.poll(() => writes.length).toBe(2);
    await expect(stripe.keyField()).toHaveValue('rk_test_offline');
  });

  test('shows a key of another account above the button when customers already live in this one', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await stripe.saveKey('rk_live_elsewhere');

    await expect(
      stripe
        .settings()
        .getByRole('alert')
        .getByText(
          "the new key reaches another account than the one this organization's customers live in",
        ),
    ).toBeVisible();
    await expect(stripe.modeBadge()).toHaveText('Test mode');
  });

  test('shows a settings schema the API refuses in its own words above the button', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    const models = createStripeConnectorModels({ standing: 'connected' });
    models.connectors.armProblem('updateConnectorSettings', {
      code: 'UpdateConnectorSettings.InvalidPayloadSchema',
      detail:
        "Connector settings payload does not match schema for connector \"kaiten.integration.billing.stripe\": at '/taxBehavior': value must be one of 'EXCLUSIVE', 'INCLUSIVE'",
      status: 422,
    });
    await install(page, models);

    await stripe.goto();
    await stripe.automaticTax().check();
    await stripe.saveButton('Save changes').click();

    await expect(stripe.settings().getByRole('alert')).toContainText(
      "at '/taxBehavior': value must be one of 'EXCLUSIVE', 'INCLUSIVE'",
    );
    await expect(stripe.automaticTax()).toBeChecked();
  });
});

test.describe('the Stripe connector where it cannot be connected', () => {
  test('explains that a deployment with no Vault cannot store the key, with the way to configure one, and offers nothing to save', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    const writes = recordWrites(page, SETTINGS, ['PUT']);
    await install(
      page,
      createStripeConnectorModels({ standing: 'vaultMissing' }),
    );

    await stripe.goto();

    await expect(stripe.unavailable()).toHaveAttribute(
      'data-reason',
      'VAULT_NOT_CONFIGURED',
    );
    await expect(stripe.unavailable()).toContainText(
      'Stripe needs a configured Vault',
    );
    await expect(
      stripe.unavailable().getByRole('link', { name: 'Self-hosting settings' }),
    ).toHaveAttribute(
      'href',
      'https://docs.kaiten.sh/docs/self-hosting/environment-variables',
    );
    await expect(stripe.standingBadge()).toHaveText('Unavailable');
    await expect(stripe.keyField()).toBeDisabled();
    await expect(stripe.saveButton('Connect Stripe')).toBeDisabled();
    await expect(stripe.disconnectButton()).toHaveCount(0);
    expect(writes).toHaveLength(0);
  });

  test('explains that the plan of the organization leaves the connector out', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(
      page,
      createStripeConnectorModels({ standing: 'notEntitled' }),
    );

    await stripe.goto();

    await expect(stripe.unavailable()).toHaveAttribute(
      'data-reason',
      'NOT_ENTITLED',
    );
    await expect(stripe.unavailable()).toContainText(
      'Not included in your plan',
    );
    await expect(stripe.unavailable().getByRole('link')).toHaveCount(0);
    await expect(stripe.keyField()).toBeDisabled();
    await expect(stripe.saveButton('Connect Stripe')).toBeDisabled();
  });

  test('is a page that explains where billing is not there, instead of failing', async ({
    page,
  }) => {
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
    await installConnectorAppMocks(page, new ConnectorAppModel());

    await page.goto('/integrations/connectors/stripe');

    await expect(page.getByTestId('billing-unavailable')).toContainText(
      'Billing is not enabled',
    );
  });

  test('can be read and not changed by a session that may only read the settings of the organization', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await signInWithScopes(page, ['read:billing', 'read:organizations']);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();

    await expect(stripe.readOnlyNotice()).toContainText(
      'You can read these settings and not change them',
    );
    await expect(stripe.keyField()).toBeDisabled();
    await expect(stripe.settings().getByRole('button')).toHaveCount(0);
    await expect(stripe.disconnectButton()).toHaveCount(0);
  });
});

test.describe('disconnecting Stripe', () => {
  test('is refused while invoices that are not settled are still in Stripe, in the words of the API and with how many there are, and the connector stays connected', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    const writes = recordWrites(page, DEACTIVATION, ['DELETE']);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await stripe.openDisconnect();
    await expect(stripe.disconnectDialog()).toContainText('Disconnect Stripe?');
    await stripe.confirmDisconnect().click();

    await expect(stripe.disconnectRefusal()).toContainText(
      'subscriptions or unsettled invoices still route to this payment provider; cancel or switch them, and settle the invoices, first',
    );
    await expect(stripe.routing()).toContainText(
      /\d+ invoices that are not settled are still in Stripe\./,
    );
    // The dialog is still over the page, and so is the connection.
    await expect(stripe.disconnectDialog()).toBeVisible();
    expect(writes).toHaveLength(1);
    await stripe
      .disconnectDialog()
      .getByRole('button', { name: 'Cancel' })
      .click();

    await expect(stripe.disconnectDialog()).toHaveCount(0);
    await expect(stripe.standingBadge()).toHaveText('Connected');
    await expect(stripe.disconnectButton()).toBeVisible();
  });

  test('turns the connector off when nothing is collected through Stripe, and keeps the key so that connecting again asks for none', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    const writes = recordWrites(page, DEACTIVATION, ['DELETE']);
    await install(
      page,
      createStripeConnectorModels({
        standing: 'connected',
        withoutRouting: true,
      }),
    );

    await stripe.goto();
    await stripe.openDisconnect();
    await stripe.confirmDisconnect().click();

    await expectToast(page, 'Stripe disconnected.');
    expect(writes).toHaveLength(1);
    await expect(stripe.disconnectDialog()).toHaveCount(0);
    await expect(stripe.standingBadge()).toHaveText('Available');
    await expect(stripe.modeBadge()).toHaveCount(0);
    await expect(stripe.disconnectButton()).toHaveCount(0);
    // The key stays stored: connecting again is a click, with none to type.
    await expect(stripe.keyField()).toHaveAttribute(
      'placeholder',
      'Key set — enter a new key to replace it',
    );
    await expect(
      stripe.saveButton('Connect Stripe with the stored key'),
    ).toBeEnabled();
  });
});
