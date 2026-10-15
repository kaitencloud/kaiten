import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { AddonGrantsDriver } from '../_support/drivers/addon-grants.driver';
import { startInLanguage } from '../_support/language';
import { installAddonsWorld } from './install-addons-world';

// A grant that replaces what a license grants with less is allowed -- it is the vendor's
// intent -- and is said before it is sent. Pro, which Extra seats fits, grants a hundred
// thousand tokens. Only an override replaces a value: a maximum keeps the larger and an
// addition adds. Among several overrides the largest wins, so that one above the license
// lowers nothing.

const GRANT_WRITES = /^\/api\/addons\/[^/]+\/entitlements(\/[^/]+)?$/;

test.describe('the value an add-on grant sets, against the license’s', () => {
  test('warns, before it is sent, that an override is lower, and sends it unchanged once confirmed', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const writes = recordWrites(page, GRANT_WRITES);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await grants.chooseEntitlement('Tokens');
    await grants.valueField().fill('50000');
    // Combined by the maximum as it starts, the larger of the two stays.
    await expect(grants.valueWarning()).toHaveCount(0);
    await grants.chooseBehavior('Override');

    await expect(grants.valueWarning()).toContainText(
      'As an override, 50,000 per unit replaces the 100,000 that Pro grants with a lower value.',
    );
    await expect(grants.valueWarning()).toContainText(
      'The API accepts it; check that it is what you mean.',
    );
    expect(writes).toEqual([]);

    await grants.submitButton().click();
    await expectToast(page, 'Entitlement added');
    expect(writes).toEqual([
      {
        body: {
          entitlementSlug: 'tokens',
          overrideBehavior: 'OVERRIDE',
          value: { type: 'number', value: 50_000 },
        },
        method: 'POST',
        pathname: '/api/addons/extra-seats-v2/entitlements',
      },
    ]);
  });

  test('says nothing of an override above the license’s, a maximum, an addition, a zero or an unlimited value', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await grants.chooseEntitlement('Tokens');
    await grants.chooseBehavior('Override');
    await grants.valueField().fill('150000');
    await expect(grants.valueWarning()).toHaveCount(0);

    await grants.valueField().fill('500');
    await expect(grants.valueWarning()).toHaveCount(1);
    await grants.chooseBehavior('Add');
    await expect(grants.valueWarning()).toHaveCount(0);
    await grants.chooseBehavior('Maximum');
    await expect(grants.valueWarning()).toHaveCount(0);

    await grants.chooseBehavior('Override');
    await expect(grants.valueWarning()).toHaveCount(1);
    // The API ignores a grant of 0, which replaces nothing.
    await grants.valueField().fill('0');
    await expect(grants.valueWarning()).toHaveCount(0);
    await grants.valueField().fill('500');
    await grants.unlimitedCheckbox().check();
    await expect(grants.valueWarning()).toHaveCount(0);
  });

  test('does not warn about the overage of a grant of 0, which the API ignores with its allowance', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await installAddonsWorld(page);
    await grants.goto('extra-seats-v2', 'Extra seats');

    await grants.addLink().click();
    await grants.chooseEntitlement('Tokens');
    await grants.valueField().fill('10000');
    await grants.overageField().fill('10');
    await expect(grants.overageWarning()).toHaveCount(1);

    await grants.valueField().fill('0');
    await expect(grants.overageWarning()).toHaveCount(0);
  });

  test('warns in French too', async ({ page }) => {
    const grants = new AddonGrantsDriver(page);
    await startInLanguage(page, 'fr');
    await installAddonsWorld(page);

    await page.goto('/catalog/addons/extra-seats-v2/entitlements?grant=new');
    await grants
      .dialog()
      .getByRole('combobox', { name: /^Droit/ })
      .click();
    await page.getByRole('option', { exact: true, name: 'Tokens' }).click();
    await grants
      .dialog()
      .getByLabel(/^Valeur par unité/)
      .fill('50000');
    await grants
      .dialog()
      .getByRole('combobox', { name: /Se combine avec la licence/ })
      .click();
    await page.getByRole('option', { exact: true, name: 'Remplacer' }).click();

    await expect(grants.valueWarning()).toContainText(
      'En remplacement, cet add-on fixe 50 000 par unité là où Pro en accorde 100 000 : une valeur plus basse.',
    );
  });
});
