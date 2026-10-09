import { expect, test } from '../_support/app-test';
import {
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { recordGraphQL } from '../_support/assertions/requests';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { startInLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import {
  createBillingDisabledModel,
  createBillingStackModel,
} from '../billing/billing.scenarios';
import { createPricedFamiliesModel } from './licenses.scenarios';

// How the version a family is shown under is sold, in a line of the list of licenses: the
// flat fee of each billing period it has, usage billed on top, or that it is free or sold on
// request. The prices are read apart from the licenses, in one request for every version, and
// only where billing is on. Free is a free version, Pro $39 a month or $390 a year with usage
// on top (its withdrawn older version was $29), Enterprise is sold on request with a price on
// file that is not shown, and Team is sold and has no active price yet.

test.describe('how a family of licenses is sold, in the list', () => {
  test.beforeEach(async ({ page }) => {
    await installLicenseAppMocks(page, createPricedFamiliesModel());
  });

  test('says it for the version the family is shown under: its flat fees and its usage, free, on request, or no price yet', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    const licenses = new LicensesListDriver(page);

    await licenses.goto();

    // The older version was cheaper: the family is not shown under it.
    await expect(licenses.priceSummary('Pro')).toHaveText(
      '$39.00/month·$390.00/year+ usage',
    );
    await expect(licenses.priceSummary('Free')).toHaveText('Free');
    // Sold on request: the amount on file is not said.
    await expect(licenses.priceSummary('Enterprise')).toHaveText(
      'Custom pricing',
    );
    await expect(licenses.priceSummary('Team')).toHaveText('No price yet');
  });

  test('asks for the prices of every version in one request, apart from the licenses', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    const graphql = recordGraphQL(page);
    const licenses = new LicensesListDriver(page);

    await licenses.goto();
    await expect(licenses.priceSummary('Pro')).toBeVisible();

    expect(
      graphql.filter(
        ({ operationName }) => operationName === 'GetLicensesWithPrices',
      ),
    ).toEqual([
      { operationName: 'GetLicensesWithPrices', variables: { limit: 200 } },
    ]);
  });

  test('says nothing, and asks for nothing, where billing is off', async ({
    page,
  }) => {
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
    const graphql = recordGraphQL(page);
    const licenses = new LicensesListDriver(page);

    await licenses.goto();
    await expect(licenses.family('Pro')).toBeVisible();

    await expect(page.getByTestId('license-price-summary')).toHaveCount(0);
    expect(graphql.map(({ operationName }) => operationName)).not.toContain(
      'GetLicensesWithPrices',
    );
  });

  test('says it for a session that reads licenses and billing, and keeps the list for one that cannot read the prices', async ({
    page,
  }) => {
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await installBillingAppMocks(page, createBillingStackModel());
    const licenses = new LicensesListDriver(page);

    await licenses.goto();

    await expect(licenses.priceSummary('Free')).toHaveText('Free');
  });

  test('is said in French with the words of the console', async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    const licenses = new LicensesListDriver(page);
    await startInLanguage(page, 'fr');

    // The title of the page is French too: the driver waits for the English one.
    await page.goto('/licenses');

    await expect(licenses.priceSummary('Free')).toHaveText('Gratuit');
    await expect(licenses.priceSummary('Enterprise')).toHaveText(
      'Tarif sur mesure',
    );
    await expect(licenses.priceSummary('Team')).toHaveText(
      'Pas encore de prix',
    );
    // Amounts are written in the language of the app, per month and per year.
    await expect(licenses.priceSummary('Pro')).toContainText('39,00');
    await expect(licenses.priceSummary('Pro')).toContainText('+ usage');
  });

  test('has no WCAG A/AA violation, in either theme', async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    const licenses = new LicensesListDriver(page);

    await licenses.goto();
    await expect(licenses.priceSummary('Pro')).toBeVisible();

    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expect(licenses.priceSummary('Pro')).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);
  });
});
