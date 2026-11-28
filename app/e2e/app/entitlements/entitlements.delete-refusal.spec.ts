import { expect, test } from '../_support/app-test';
import { delayRequests } from '../_support/assertions/requests';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createCombinedEntitlementModel,
  createReferencedEntitlementModel,
  createReferencedLastEntitlementModel,
} from './entitlements.scenarios';

// An entitlement that something still grants or prices is kept. The API
// counts what references it, and the dialog lists it so that the person knows what
// to remove first. One that nothing references is deleted as before.

test.describe('deleting an entitlement that is still in use', () => {
  test('is refused, with what still grants or prices it, and leads to it', async ({
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
      'Entitlement "api-calls" is still in use and cannot be deleted',
    );
    const references = refusal.getByTestId('deletion-refusal-references');
    await expect(references.getByRole('listitem')).toHaveText([
      'Granted by 2 license versions',
      'Metered by 1 license price',
      'Granted by 3 add-ons',
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

    await expect(page).toHaveURL(/\/catalog\/entitlements\/api-calls$/);
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
      'Granted by 1 add-on',
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
    ).toHaveText(['Granted by 1 add-on']);
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

// A combined entitlement sums its sources: deleting one that is still summed would leave
// the sum with a source that is not there, so the API keeps it and names the combined
// entitlement. The combined one itself, which nothing references, is deleted as any other.
test.describe('deleting an entitlement that a combined entitlement sums', () => {
  test('is refused, with the combined entitlement that sums it, and can be taken off it first', async ({
    page,
  }) => {
    const list = new EntitlementsListDriver(page);
    await installEntitlementAppMocks(page, createCombinedEntitlementModel());

    await list.goto();
    await list.openDeleteDialog('Firecrawl Credits');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    const refusal = page.getByRole('dialog', {
      name: 'This entitlement cannot be deleted',
    });
    await expect(refusal).toBeVisible();
    // The API names the combined entitlement that sums it, in its own words.
    await expect(refusal).toContainText('it is a source of credits');
    await expect(
      refusal.getByTestId('deletion-refusal-references').getByRole('listitem'),
    ).toHaveText(['Summed by 1 combined entitlement']);
    // Editing the combined entitlement takes it off: nothing that stays for good holds it.
    await expect(refusal).toContainText(
      'Remove these references, then delete the entitlement again.',
    );
    await expect(refusal).not.toContainText('turn off “User facing”');
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await list.expectEntitlementVisible('Firecrawl Credits');
  });

  test('deletes the combined entitlement itself, which nothing sums', async ({
    page,
  }) => {
    const list = new EntitlementsListDriver(page);
    await installEntitlementAppMocks(page, createCombinedEntitlementModel());

    await list.goto();
    await list.openDeleteDialog('Credits');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await list.expectEntitlementHidden('Credits');
    await expect(
      page.getByRole('dialog', { name: 'This entitlement cannot be deleted' }),
    ).toHaveCount(0);
    // Its sources are free again.
    await list.expectEntitlementVisible('Firecrawl Credits');
  });
});
