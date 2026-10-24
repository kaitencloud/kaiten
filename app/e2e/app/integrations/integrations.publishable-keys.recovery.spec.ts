import { expect, test } from '../_support/app-test';
import { readConsoleStorage } from '../_support/assertions/storage';
import { FormRecoveryDriver } from '../_support/drivers/form-recovery.driver';
import { PublishableKeysDriver } from '../_support/drivers/publishable-keys.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { createAnonymousCheckoutBillingModel } from './integrations.scenarios';

// The unsent input of the issue of a publishable key, as the console keeps it in the
// browser: offered back after a reload, never with the Turnstile secret, which is
// written to the API and read by nobody. Cloudflare's published test keys stand for a
// widget.

const SITE_KEY = '1x00000000000000000000AA';
const SECRET = '1x0000000000000000000000000000000AA';

test('offers back a half-filled key after a reload without its Turnstile secret, and forgets it once issued', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const keys = new PublishableKeysDriver(page);
  const recovery = new FormRecoveryDriver(page);
  await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());

  await page.goto('/integrations/publishable-keys/new');
  await expect(recovery.offer()).toHaveCount(0);
  await keys.fill({
    label: 'Storefront checkout',
    origins: ['https://shop.acme.test'],
  });
  await keys.siteKeyField().fill(SITE_KEY);
  await keys.secretField().fill(SECRET);
  await expect
    .poll(() => readConsoleStorage(page))
    .toContain('Storefront checkout');
  expect(await readConsoleStorage(page)).not.toContain(SECRET);

  await page.reload();
  await expect(recovery.offer()).toBeVisible();
  await expect(recovery.offer()).toContainText('Turnstile secret');
  await expect(recovery.resumeButton()).toBeFocused();
  await expect(keys.labelField()).toHaveValue('');

  await recovery.resumeButton().click();
  await expect(keys.labelField()).toHaveValue('Storefront checkout');
  await expect(keys.originsField()).toHaveValue('https://shop.acme.test');
  await expect(keys.siteKeyField()).toHaveValue(SITE_KEY);
  await expect(keys.secretField()).toHaveValue('');

  await keys.secretField().fill(SECRET);
  await keys.createButton().click();
  await expect(keys.createdKey()).toBeVisible();
  expect(await readConsoleStorage(page)).not.toContain(SECRET);
  await keys.copyKey().click();
  await keys.done().click();

  await page.goto('/integrations/publishable-keys/new');
  await expect(keys.labelField()).toBeVisible();
  await page.reload();
  await expect(keys.labelField()).toHaveValue('');
  await expect(recovery.offer()).toHaveCount(0);
});
