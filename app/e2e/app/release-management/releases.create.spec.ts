import { expect, test } from '../_support/app-test';
import { ReleaseDetailDriver } from '../_support/drivers/release-detail.driver';
import { ReleaseFormDriver } from '../_support/drivers/release-form.driver';
import { installReleaseManagementAppMocks } from '../_support/mocks/install-release-management-app-mocks';
import { createReleaseCreationModel } from './release-management.scenarios';

test.describe('release-management releases create', () => {
  test('creates a release from scratch', async ({ page }) => {
    const model = createReleaseCreationModel();
    const form = new ReleaseFormDriver(page);

    await installReleaseManagementAppMocks(page, model);
    await page.goto('/releases/new');

    await expect(
      page.getByRole('heading', { name: 'Create Release', level: 1 }),
    ).toBeVisible();

    // Step 1 (base): pick the creation mode, then advance.
    await form.chooseScratchMode();
    await form.clickNext();

    // Step 2 (metadata): the step gates "Next" until a version is provided.
    await expect(form.nextButton()).toBeDisabled();
    await form.fillMetadata({
      description: 'Quarterly hardening release for every production zone',
      version: 'v1.6.0',
    });
    await expect(form.nextButton()).toBeEnabled();
    await form.clickNext();

    // Step 3 (components): the final step exposes the submit button.
    await expect(form.createButton()).toBeEnabled();
    await form.createButton().click();

    // The new release opens on its own page.
    await expect(page).toHaveURL(/\/releases\/[^/]+$/);
    await new ReleaseDetailDriver(page).expectLoaded('v1.6.0');

    // Cache invalidation: back on the list through internal navigation, the
    // new release is there without a hard reload.
    await page
      .getByRole('navigation', { name: 'breadcrumb' })
      .getByRole('link', { name: 'Releases', exact: true })
      .click();
    await expect(page).toHaveURL('/releases');
    await expect(
      page.getByText('v1.6.0', { exact: true }).first(),
    ).toBeVisible();
  });

  test('creates a release from an existing base release', async ({ page }) => {
    const model = createReleaseCreationModel();
    const form = new ReleaseFormDriver(page);

    await installReleaseManagementAppMocks(page, model);
    await page.goto('/releases/new');

    // Step 1 (base): inherit from an existing release, then advance.
    await form.chooseExistingRelease('v1.5.0-rc1');
    await expect(page.getByText('Based on v1.5.0-rc1')).toBeVisible();
    await form.clickNext();

    // Step 2 (metadata): the step gates "Next" until a version is provided.
    await expect(form.nextButton()).toBeDisabled();
    await form.fillMetadata({
      description:
        'General availability rollout based on the staging candidate',
      version: 'v1.5.0',
    });
    await expect(form.nextButton()).toBeEnabled();
    await form.clickNext();

    // Step 3 (components): the final step exposes the submit button.
    await expect(form.createButton()).toBeEnabled();
    await form.createButton().click();

    // The new release opens on its own page.
    await expect(page).toHaveURL(/\/releases\/[^/]+$/);
    await new ReleaseDetailDriver(page).expectLoaded('v1.5.0');
  });
});
