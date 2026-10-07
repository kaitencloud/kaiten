import { expect, test } from '../_support/app-test';
import { delayRequests } from '../_support/assertions/requests';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createReferencedEntitlementModel,
  createReferencedLastEntitlementModel,
} from './entitlements.scenarios';

// An entitlement that something still grants, counts or prices is kept. The API
// counts what references it, and the dialog lists it so that the person knows what
// to remove first. One that nothing references is deleted as before.

test.describe('deleting an entitlement that is still in use', () => {
  test('is refused, with what still grants, counts or prices it, and leads to it', async ({
    page,
  }) => {
    const list = new EntitlementsListDriver(page);
    await installEntitlementAppMocks(page, createReferencedEntitlementModel());

    await list.goto();
    await list.openDeleteDialog('API Calls');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    const refusal = page.getByRole('dialog', {
      name: 'This entitlement cannot be deleted',
    });
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText(
      'Entitlement "api-calls" is still granted, counted or priced and cannot be deleted',
    );
    const references = refusal.getByTestId('deletion-refusal-references');
    await expect(references.getByRole('listitem')).toHaveText([
      'Granted by 2 license versions',
      'Usage recorded on 3 instances',
      'Metered by 1 license price',
    ]);
    // A price meters it, and a price is never removed: it is offered to be hidden.
    await expect(refusal).toContainText(
      'A price or a voucher boost cannot be removed once it exists',
    );
    await expect(refusal).toContainText('turn off “User facing” on its page');
    await expect(refusal).not.toContainText(
      'Remove these references, then delete the entitlement again.',
    );
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

    await refusal.getByRole('link', { name: 'Open the entitlement' }).click();

    await expect(page).toHaveURL(/\/entitlements\/api-calls$/);
  });

  test('says "1" in the singular, and lists only what there is', async ({
    page,
  }) => {
    const list = new EntitlementsListDriver(page);
    await installEntitlementAppMocks(page, createReferencedEntitlementModel());

    await list.goto();
    await list.openDeleteDialog('Seats');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    const references = page
      .getByRole('dialog', { name: 'This entitlement cannot be deleted' })
      .getByTestId('deletion-refusal-references');
    await expect(references.getByRole('listitem')).toHaveText([
      'Usage recorded on 1 instance',
    ]);
    // Nothing that stays for good holds it: the references can be taken away.
    await expect(
      page.getByRole('dialog', { name: 'This entitlement cannot be deleted' }),
    ).toContainText(
      'Remove these references, then delete the entitlement again.',
    );
  });

  test('is shown for the last row of the list too, which has left it by the time the API refuses', async ({
    page,
  }) => {
    const list = new EntitlementsListDriver(page);
    // The API answers late: the row is out of the list in the meantime, as it is
    // for a person who deletes on a slow connection.
    await delayRequests(page, {
      methods: ['DELETE'],
      ms: 1_000,
      pathname: /\/api\/entitlements\/[^/]+$/,
    });
    await installEntitlementAppMocks(
      page,
      createReferencedLastEntitlementModel(),
    );

    await list.goto();
    await list.openDeleteDialog('Seats');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await list.expectEntitlementHidden('Seats');
    const refusal = page.getByRole('dialog', {
      name: 'This entitlement cannot be deleted',
    });
    await expect(refusal).toBeVisible();
    await expect(
      refusal.getByTestId('deletion-refusal-references').getByRole('listitem'),
    ).toHaveText(['Usage recorded on 1 instance']);
    // Nothing was deleted: the row is back, and no toast says otherwise.
    await list.expectEntitlementVisible('Seats');
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });

  test('deletes an entitlement that nothing references', async ({ page }) => {
    const list = new EntitlementsListDriver(page);
    await installEntitlementAppMocks(page, createReferencedEntitlementModel());

    await list.goto();
    await list.openDeleteDialog('Priority Support');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await list.expectEntitlementHidden('Priority Support');
    await expect(
      page.getByRole('dialog', { name: 'This entitlement cannot be deleted' }),
    ).toHaveCount(0);
  });
});
