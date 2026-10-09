import { expect, recordWrites, test } from '../_support/app-test';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { IntegrationsNavDriver } from '../_support/drivers/integrations-nav.driver';
import { PublishableKeysDriver } from '../_support/drivers/publishable-keys.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import {
  BillingAppModel,
  CAPABILITIES_OUTAGES,
} from '../_support/model/billing-app-model';
import { billingCapabilitiesProfiles } from '../_support/model/billing-capabilities';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { createBillingDisabledModel } from '../billing/billing.scenarios';
import { createPublishableKeysBillingModel } from './integrations.scenarios';

// Where the publishable keys are, and who may do what to them. They exist where billing is
// on, whatever the capabilities say of the public surface (the API fixes that flag to false);
// the Integrations section lists them to a session that may read them; and a session that
// may only read sees the keys with none of the controls that change them.

const KEY_REQUESTS = /^\/api\/publishable-keys(\/|$)/;

const READER = [...SESSION_SCOPES.reader, 'read:publishable_keys'];
const WRITER = [...READER, 'write:publishable_keys'];

test.describe('the entry of the navigation', () => {
  test('lists the publishable keys last in Integrations where billing is on, and opens them', async ({
    page,
  }) => {
    const nav = new IntegrationsNavDriver(page);
    const keys = new PublishableKeysDriver(page);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());

    await new BillingNavDriver(page).gotoShell();
    await nav.open();

    await nav.expectEntries([
      'Service Accounts',
      'Connectors',
      'Publishable keys',
    ]);
    await expect(nav.entry('Publishable keys')).toHaveAttribute(
      'href',
      '/integrations/publishable-keys',
    );
    await nav.entry('Publishable keys').click();
    await expect(page).toHaveURL('/integrations/publishable-keys');
    await keys.expectLoaded();
    // On a page of the section, the section stays open.
    await expect(nav.section()).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.entry('Publishable keys')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('is listed on the capabilities the API serves now, which say the public surface is off', async ({
    page,
  }) => {
    const nav = new IntegrationsNavDriver(page);
    const model = new BillingAppModel({
      capabilities: billingCapabilitiesProfiles.stackWithStripe('connected'),
    });
    await installBillingAppMocks(page, model);

    expect(model.getCapabilities().features.publicSurface).toBe(false);
    await new BillingNavDriver(page).gotoShell();
    await nav.open();

    await expect(nav.entry('Publishable keys')).toBeVisible();
  });

  test('is left out where billing is off, whatever the reason', async ({
    page,
  }) => {
    const nav = new IntegrationsNavDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await new BillingNavDriver(page).gotoShell();
    await nav.open();

    await nav.expectEntries(['Service Accounts', 'Connectors']);
    await expect(nav.entry('Publishable keys')).toHaveCount(0);
  });

  test('is left out where the capabilities cannot be read', async ({
    page,
  }) => {
    const nav = new IntegrationsNavDriver(page);
    const model = createPublishableKeysBillingModel();
    model.failCapabilities(CAPABILITIES_OUTAGES.unavailable);
    await installBillingAppMocks(page, model);

    await new BillingNavDriver(page).gotoShell();
    await nav.open();

    await nav.expectEntries(['Service Accounts', 'Connectors']);
    await expect(nav.entry('Publishable keys')).toHaveCount(0);
  });

  test('is left out for a session that may not read the keys, and offered to one that may', async ({
    page,
  }) => {
    const nav = new IntegrationsNavDriver(page);
    await signInWithScopes(page, ['read:billing', 'read:licenses']);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());

    await new BillingNavDriver(page).gotoShell();
    await nav.open();

    await nav.expectEntries(['Service Accounts', 'Connectors']);
    await expect(nav.entry('Publishable keys')).toHaveCount(0);

    await signInWithScopes(page, ['read:billing', 'read:publishable_keys']);
    await new BillingNavDriver(page).gotoShell();
    await nav.open();
    await expect(nav.entry('Publishable keys')).toBeVisible();
  });
});

test.describe('where billing is not there', () => {
  const REASONS = [
    [
      'DEPLOYMENT_DISABLED',
      () => createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    ],
    ['NOT_ENTITLED', () => createBillingDisabledModel('NOT_ENTITLED')],
  ] as const;

  for (const [reason, createModel] of REASONS) {
    for (const path of [
      '/integrations/publishable-keys',
      '/integrations/publishable-keys/new',
      '/integrations/publishable-keys/pk-1/edit',
    ]) {
      test(`explains ${reason} on ${path}, in place of the screen`, async ({
        page,
      }) => {
        const nav = new BillingNavDriver(page);
        await installBillingAppMocks(page, createModel());

        await page.goto(path);

        await nav.expectUnavailable(reason);
        await expect(page.getByText('Page not found')).toHaveCount(0);
        await expect(
          page.getByRole('heading', { level: 1, name: 'Publishable keys' }),
        ).toHaveCount(0);
      });
    }
  }

  test('asks the API for no key', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    const requests = recordWrites(page, KEY_REQUESTS, ['GET', 'POST', 'PATCH']);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await page.goto('/integrations/publishable-keys');
    await nav.expectUnavailable('DEPLOYMENT_DISABLED');

    expect(requests).toEqual([]);
  });

  test('explains the scope the capabilities lack, for a session without read:billing', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const model = createPublishableKeysBillingModel();
    model.failCapabilities(CAPABILITIES_OUTAGES.missingScope);
    await installBillingAppMocks(page, model);

    await page.goto('/integrations/publishable-keys');

    await nav.expectUnavailable('MISSING_SCOPE');
  });
});

test.describe('a session that may only read the publishable keys', () => {
  test.beforeEach(async ({ page }) => {
    await signInWithScopes(page, READER);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());
  });

  test('reads the keys, with no way to issue, edit or revoke one', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);

    await keys.goto();

    await expect(keys.rows()).toHaveCount(3);
    await expect(keys.row('pricing')).toContainText('…a1B2');
    await expect(
      page.getByRole('link', { name: 'New publishable key' }),
    ).toHaveCount(0);
    for (const label of ['pricing', 'Storefront', 'Docs']) {
      await expect(keys.editLink(label)).toHaveCount(0);
      await expect(keys.revokeButton(label)).toHaveCount(0);
    }
    // It still reads the revoked ones.
    await keys.includeRevoked().click();
    await expect(keys.row('Legacy checkout')).toContainText('Revoked');
  });

  test('opens no dialog from the address of one', async ({ page }) => {
    const keys = new PublishableKeysDriver(page);

    await page.goto('/integrations/publishable-keys/new');
    await keys.expectLoaded();
    await expect(keys.dialog()).toHaveCount(0);

    await page.goto('/integrations/publishable-keys/pk-1/edit');
    await keys.expectLoaded();
    await expect(keys.dialog()).toHaveCount(0);
  });
});

test.describe('a session that may write the publishable keys', () => {
  test('is offered every control', async ({ page }) => {
    const keys = new PublishableKeysDriver(page);
    await signInWithScopes(page, WRITER);
    await installBillingAppMocks(page, createPublishableKeysBillingModel());

    await keys.goto();

    await expect(keys.newKey()).toBeVisible();
    await expect(keys.editLink('pricing')).toBeVisible();
    await expect(keys.revokeButton('pricing')).toBeVisible();
  });

  test('is told which scope it lacks when the API refuses it', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    const model = createPublishableKeysBillingModel();
    model.publishableKeys.armProblem('createPublishableKey', {
      code: 'Auth.MissingScope',
      detail: 'missing required scope: write:publishable_keys',
      status: 403,
    });
    await installBillingAppMocks(page, model);
    await keys.goto();
    await keys.newKey().click();

    await keys.fill({ label: 'pricing' });
    await keys.createButton().click();

    await expect(keys.dialog()).toContainText('write:publishable_keys');
    await expect(keys.createdKey()).toHaveCount(0);
  });
});
