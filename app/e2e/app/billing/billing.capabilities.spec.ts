import { expect, test } from '../_support/app-test';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { BillingSettingsDriver } from '../_support/drivers/billing-settings.driver';
import { StripeConnectorDriver } from '../_support/drivers/stripe-connector.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installConnectorAppMocks } from '../_support/mocks/install-connector-app-mocks';
import { BillingAppModel } from '../_support/model/billing-app-model';
import {
  ALL_BILLING_FEATURES,
  billingCapabilitiesProfiles,
  NO_BILLING_FEATURES,
} from '../_support/model/billing-capabilities';
import { ConnectorAppModel } from '../_support/model/connector-app-model';

// What the console shows of billing follows the capabilities the API answers with, and
// nothing else: the navigation is there where billing is `enabled`, and the tile of
// Stripe says where Stripe stands from the `providers` it lists (connected, free to be,
// not in the plan, or in need of a Vault). Three flags of `features` (`stripe`,
// `chargeAutomatically`, `publicSurface`) say what the release ships and are true on every
// organization, so they are no part of that decision, and neither are the platform flags.
// The answers below are the ones of the organizations of the API's
// own tests: a Cloud organization on a beta plan, one on a starter plan, one on a pro plan
// with Stripe connected, and a self-hosted deployment with no Vault.

const betaTester = () =>
  new BillingAppModel({
    capabilities: {
      ...billingCapabilitiesProfiles.stackWithStripe('notEntitled'),
      disabledReason: 'NOT_ENTITLED',
      enabled: false,
      features: ALL_BILLING_FEATURES,
      publicSurface: { enabled: false },
    },
  });
const starter = () =>
  new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stackWithStripe('notEntitled'),
  });
const pro = () =>
  new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stackWithStripe('connected'),
  });
const selfHostedWithoutVault = () =>
  new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stackWithStripe('vaultMissing'),
  });

async function install(
  page: Parameters<typeof installBillingAppMocks>[0],
  billing: BillingAppModel,
) {
  await installBillingAppMocks(page, billing);
  await installConnectorAppMocks(page, new ConnectorAppModel());
}

test.describe('billing where the plan leaves it out', () => {
  test('is out of the navigation and of the settings, and the tile of Stripe says the plan does not include it', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const settings = new BillingSettingsDriver(page);
    const stripe = new StripeConnectorDriver(page);
    await install(page, betaTester());

    await nav.gotoShell();
    await nav.expectNoSection();

    await settings.gotoSettings();
    await expect(settings.linkCard()).toHaveCount(0);

    await stripe.gotoIndex();
    await expect(stripe.tile()).toContainText('Not included in your plan');
    await expect(stripe.tile()).toContainText('Unavailable');
    await expect(
      stripe.tile().getByRole('button', { name: 'Connect' }),
    ).toBeDisabled();
  });
});

test.describe('billing where it is on', () => {
  test('is in the navigation and the settings, with Stripe connected on the tile', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const settings = new BillingSettingsDriver(page);
    const stripe = new StripeConnectorDriver(page);
    await install(page, pro());

    await nav.gotoShell();
    await nav.open();
    await nav.expectEntries(['Invoices', 'Handoff']);

    await settings.gotoSettings();
    await expect(settings.linkCard()).toBeVisible();

    await stripe.gotoIndex();
    await expect(stripe.tile()).toContainText('Connected');
  });

  test('is on for a plan that leaves Stripe out, and the tile says so', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const stripe = new StripeConnectorDriver(page);
    await install(page, starter());

    await nav.gotoShell();
    await nav.open();
    await nav.expectEntries(['Invoices', 'Handoff']);

    await stripe.gotoIndex();
    await expect(stripe.tile()).toContainText('Not included in your plan');
  });

  test('is on for a deployment with no Vault, and the tile says Stripe needs one, with nothing to activate', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const stripe = new StripeConnectorDriver(page);
    await install(page, selfHostedWithoutVault());

    await nav.gotoShell();
    await nav.open();
    await nav.expectEntries(['Invoices', 'Handoff']);

    await stripe.gotoIndex();
    await expect(stripe.tile()).toContainText(
      'Stripe needs a configured Vault',
    );
    await expect(
      stripe.tile().getByRole('button', { name: 'Connect' }),
    ).toBeDisabled();
  });
});

test.describe('where Stripe stands, read from the providers and not from the flags', () => {
  test('is connected whatever `features.stripe` says', async ({ page }) => {
    const stripe = new StripeConnectorDriver(page);
    const settings = new BillingSettingsDriver(page);
    await install(
      page,
      new BillingAppModel({
        capabilities: {
          ...billingCapabilitiesProfiles.stackWithStripe('connected'),
          features: { ...NO_BILLING_FEATURES, lifecycle: true, stripe: false },
        },
      }),
    );

    await stripe.gotoIndex();
    await expect(stripe.tile()).toContainText('Connected');

    await settings.goto();
    await expect(settings.stripe()).toContainText('Connected');
  });

  test('is not in the plan whatever `features.stripe` and the other flags say', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(
      page,
      new BillingAppModel({
        capabilities: {
          ...billingCapabilitiesProfiles.stackWithStripe('notEntitled'),
          features: ALL_BILLING_FEATURES,
        },
      }),
    );

    await stripe.gotoIndex();
    await expect(stripe.tile()).toContainText('Not included in your plan');
  });

  test('keeps automatic collection off as the default where a connected provider charges, whatever `features.chargeAutomatically` says, and points to the contract', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await install(
      page,
      new BillingAppModel({
        capabilities: {
          ...billingCapabilitiesProfiles.stackWithStripe('connected'),
          features: { ...NO_BILLING_FEATURES, chargeAutomatically: false },
        },
      }),
    );

    await settings.goto();
    await settings.collectionMethod().click();

    await expect(
      page.getByRole('option', {
        name: 'Charge automatically (set on each contract)',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });
});
