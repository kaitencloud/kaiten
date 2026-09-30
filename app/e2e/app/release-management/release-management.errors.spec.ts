import { expect, expectErrorToast, test } from '../_support/app-test';
import { ReleaseFormDriver } from '../_support/drivers/release-form.driver';
import { installReleaseManagementAppMocks } from '../_support/mocks/install-release-management-app-mocks';
import { createReleaseCreationModel } from './release-management.scenarios';

test.describe('release-management errors', () => {
  test('shows an error toast when release creation fails with a server error', async ({
    page,
  }) => {
    const model = createReleaseCreationModel();
    const form = new ReleaseFormDriver(page);

    // Arm the next createRelease call to fail with a 500
    model.setNextError('createRelease', 500);

    await installReleaseManagementAppMocks(page, model);
    await page.goto('/releases/new');

    // Walk the create stepper: base → metadata → components, then submit.
    await form.chooseScratchMode();
    await form.clickNext();
    await form.fillMetadata({
      description: 'Release that should fail at submit time',
      version: 'v1.6.0',
    });
    await form.clickNext();
    await form.createButton().click();

    // The app must show an error toast — release must not appear in the list
    await expectErrorToast(page);
    await page.goto('/releases');
    await expect(page.getByText('v1.6.0', { exact: true })).toHaveCount(0);
  });
});
