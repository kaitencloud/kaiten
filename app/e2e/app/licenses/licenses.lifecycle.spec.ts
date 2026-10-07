import { expect, expectToast, test } from '../_support/app-test';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicenseLifecycleDialogDriver } from '../_support/drivers/license-lifecycle-dialog.driver';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createBillingStackModel } from '../billing/billing.scenarios';
import { createLicenseCatalogModel } from './licenses.scenarios';

test('publishes a draft version from the versions table', async ({ page }) => {
  const list = new LicensesListDriver(page);
  const dialog = new LicenseLifecycleDialogDriver(page);

  await installLicenseAppMocks(page, createLicenseCatalogModel());
  await list.goto();
  await list.expandFamily('Starter');

  await list.lifecycleAction('Starter', 'Next', 'Publish').click();
  await dialog.expectTitle('Publish Starter v4?');
  await dialog.confirm('Publish');

  await expectToast(page, 'Version published');
  await list.expectVersionState('Starter', 'Next', 'Published');
  // The action is not a click on the row, which would open the version.
  await expect(page).toHaveURL('/licenses');
});

test('changes nothing when the confirmation is cancelled', async ({ page }) => {
  const list = new LicensesListDriver(page);
  const dialog = new LicenseLifecycleDialogDriver(page);
  const transitionRequests: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (
      request.method() === 'POST' &&
      /^\/api\/licenses\/[^/]+\/(publish|archive|unarchive)$/.test(pathname)
    ) {
      transitionRequests.push(pathname);
    }
  });

  await installLicenseAppMocks(page, createLicenseCatalogModel());
  await list.goto();
  await list.expandFamily('Starter');

  await list.lifecycleAction('Starter', 'Spring', 'Archive').click();
  await dialog.cancel();
  await list.expectVersionState('Starter', 'Spring', 'Published');

  // The row reads Published at once whether or not the cancel sent anything.
  // A confirmed archive afterwards is what tells: by the time it has
  // answered, a request sent by the cancel would be on record before it.
  await list.lifecycleAction('Starter', 'Spring', 'Archive').click();
  await dialog.confirm('Archive');
  await expectToast(page, 'Version archived');
  expect(transitionRequests).toEqual(['/api/licenses/starter-v3/archive']);
});

test('archives a version from its page, then puts it back on sale', async ({
  page,
}) => {
  const detail = new LicenseDetailDriver(page);
  const dialog = new LicenseLifecycleDialogDriver(page);

  await installLicenseAppMocks(page, createLicenseCatalogModel());
  await detail.goto('starter-v3', 'Starter');
  await detail.expectState('Published');

  await detail.lifecycleAction('Archive').click();
  await dialog.expectTitle('Archive Starter v3?');
  await dialog.confirm('Archive');
  await expectToast(page, 'Version archived');
  await detail.expectState('Archived');

  await detail.lifecycleAction('Unarchive').click();
  await dialog.expectTitle('Unarchive Starter v3?');
  await dialog.confirm('Unarchive');
  await expectToast(page, 'Version unarchived');
  await detail.expectState('Published');
});

test("withholds archiving the family's default and says why", async ({
  page,
}) => {
  const detail = new LicenseDetailDriver(page);

  await installLicenseAppMocks(page, createLicenseCatalogModel());
  await detail.goto('starter-v2', 'Starter');

  const archive = detail.lifecycleAction('Archive');
  await expect(archive).toBeDisabled();
  // A disabled button emits no pointer events; its wrapper shows the reason.
  await archive.locator('..').hover();
  await expect(page.getByRole('tooltip')).toContainText(
    'The default version cannot be archived',
  );
});

test('shows the reason the API gives when the version moved in the meantime', async ({
  page,
}) => {
  const list = new LicensesListDriver(page);
  const dialog = new LicenseLifecycleDialogDriver(page);

  await installLicenseAppMocks(page, createLicenseCatalogModel());
  await list.goto();
  await list.expandFamily('Starter');

  // Someone else publishes the draft while this page still shows it as one.
  await page.evaluate(async () => {
    await fetch('/api/licenses/starter-v4/publish', { method: 'POST' });
  });

  await list.lifecycleAction('Starter', 'Next', 'Publish').click();
  await dialog.confirm('Publish');

  await expectToast(page, 'License "starter-v4" is already published');
  // Refetched all the same, so the table catches up with the version.
  await list.expectVersionState('Starter', 'Next', 'Published');
});

// What publishing changes for what a version sells is said where something is
// sold, and only when a version is published: it is billing's to say.
test.describe('the confirmation to publish', () => {
  test('says what it changes for the prices and the grants where billing is on', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const dialog = new LicenseLifecycleDialogDriver(page);

    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createLicenseCatalogModel());
    await list.goto();
    await list.expandFamily('Starter');
    await list.lifecycleAction('Starter', 'Next', 'Publish').click();

    await dialog.expectTitle('Publish Starter v4?');
    const note = dialog.dialog().getByRole('list');
    await expect(note).toContainText(
      'Its prices become immutable: from then on they can only be deprecated.',
    );
    await expect(note).toContainText(
      'Its entitlements are frozen as soon as a subscription bills this version.',
    );
    await expect(note).toContainText(
      'Subscriptions on other versions are not affected, and nothing is archived.',
    );
  });

  test('says nothing of prices where billing is not there', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const dialog = new LicenseLifecycleDialogDriver(page);

    await installLicenseAppMocks(page, createLicenseCatalogModel());
    await list.goto();
    await list.expandFamily('Starter');
    await list.lifecycleAction('Starter', 'Next', 'Publish').click();

    await dialog.expectTitle('Publish Starter v4?');
    await expect(dialog.dialog().getByRole('list')).toHaveCount(0);
  });

  test('says nothing of prices when a version is archived, which sells nothing new', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const dialog = new LicenseLifecycleDialogDriver(page);

    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createLicenseCatalogModel());
    await list.goto();
    await list.expandFamily('Starter');
    await list.lifecycleAction('Starter', 'Spring', 'Archive').click();

    await dialog.expectTitle('Archive Starter v3?');
    await expect(dialog.dialog().getByRole('list')).toHaveCount(0);
  });
});
