import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { VoucherDetailDriver } from '../_support/drivers/voucher-detail.driver';
import { VoucherWizardDriver } from '../_support/drivers/voucher-wizard.driver';
import { BILLED_NOW } from '../billing/billed-instances';
import { installVouchersWorld } from './install-vouchers-world';
import { createVouchersBillingModel } from './vouchers.scenarios';

// The wizard that makes a voucher: the kind, the offer, who may redeem it and how often, and a
// review in plain language that publishes it. A voucher is created as a draft and then
// published, in two requests, so that a refused publication keeps the draft. The code, once
// published, is shown with a button to copy it and is in no address.

const MAKING = /\/api\/vouchers(\/[^/]+(\/publish)?)?$/;

test.describe('the kind of voucher', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
    await installVouchersWorld(page);
  });

  test('offers the two kinds the release ships, and shows the two that come later, disabled and as available later', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);

    await wizard.goto();

    await expect(wizard.kind('Discount')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(wizard.kind('Boost')).toHaveAttribute('aria-pressed', 'false');
    for (const later of ['Feature grant', 'Bundle'] as const) {
      await expect(wizard.kind(later)).toHaveAttribute('aria-disabled', 'true');
      await expect(wizard.kind(later)).toContainText(
        'Available in a later version',
      );
      // It stays in the tab order and can be pressed, and nothing happens.
      await wizard.kind(later).click({ force: true });
      await expect(wizard.kind(later)).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(wizard.kind('Discount')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('cannot be left without a name, and says so once it was asked', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();

    await expect(wizard.error('Enter a name')).toHaveCount(0);
    await wizard.next().click();

    await expect(wizard.error('Enter a name')).toBeVisible();
    await wizard.expectStep('Kind');
  });

  test('goes on when Enter is pressed in the name, and does not send anything', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    const writes = recordWrites(page, MAKING);
    await wizard.goto();

    await wizard.nameField().fill('Welcome');
    await wizard.nameField().press('Enter');

    await wizard.expectStep('Offer');
    expect(writes).toEqual([]);
  });
});

test.describe('the offer of a discount', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
    await installVouchersWorld(page);
  });

  test('needs a percentage above 0 and up to 100: zero and a hundred and one are refused on the field, twenty goes on', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Welcome 20');

    for (const typed of ['0', '101']) {
      await wizard.percentageField().fill(typed);
      await wizard.next().click();
      await expect(
        wizard.error('Enter a percentage above 0 and up to 100'),
      ).toBeVisible();
      await wizard.expectStep('Offer');
    }
    await wizard.percentageField().fill('20');
    await wizard.next().click();

    await wizard.expectStep('Who and when');
  });

  test('needs a currency for a fixed amount', async ({ page }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Fifty off');

    await wizard.discountType('A fixed amount').click();
    await wizard.amountField().fill('50');
    await wizard.next().click();

    await expect(wizard.error('Currency required')).toBeVisible();
    await wizard.expectStep('Offer');

    await wizard.chooseCurrency('USD');
    await wizard.next().click();
    await wizard.expectStep('Who and when');
  });

  test('needs at least one price when it applies to chosen prices, which are listed under the version each is of', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Some prices');
    await wizard.percentageField().fill('15');

    await wizard.appliesTo('Chosen prices').click();
    await expect(wizard.priceList()).toBeVisible();
    await wizard.next().click();

    await expect(wizard.error('Tick at least one price')).toBeVisible();
    await expect(
      wizard.priceList().getByRole('checkbox').first(),
    ).toBeVisible();
    await wizard.priceList().getByRole('checkbox').first().check();
    await wizard.next().click();
    await wizard.expectStep('Who and when');
  });

  test('counts the invoices when the offer repeats', async ({ page }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Repeating');

    await wizard.chooseDuration('A number of times');

    await expect(wizard.timesField()).toHaveAccessibleName(
      /Number of invoices/,
    );
    await wizard.percentageField().fill('10');
    await wizard.next().click();
    await expect(wizard.error('Enter a whole number from 1')).toBeVisible();
    await wizard.timesField().fill('12');
    await wizard.next().click();
    await wizard.expectStep('Who and when');
  });
});

test.describe('the offer of a boost', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
    await installVouchersWorld(page);
  });

  test('needs a change before it goes on, and offers the entitlements that carry a number and no other', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Boost', 'More tokens');

    await wizard.next().click();
    await expect(wizard.error('Add at least one change')).toBeVisible();

    await wizard.addChange().click();
    // The flag and the configuration have no value to set, add to or multiply.
    expect((await wizard.offeredEntitlements(0)).sort()).toEqual([
      'AI credits',
      'Seats',
      'Storage',
      'Tokens',
    ]);
  });

  test('offers four modifiers, asks no value to lift a limit, refuses zero to add or multiply and accepts it to set a limit', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Boost', 'Modifiers');
    await wizard.addChange().click();
    await wizard.chooseEntitlement(0, 'Tokens');

    await wizard.modifier(0).click();
    await expect(page.getByRole('option')).toHaveText([
      'Set to',
      'Add',
      'Multiply by',
      'Make unlimited',
    ]);
    await page.keyboard.press('Escape');

    // Add refuses zero and a negative.
    await wizard.valueField(0).fill('0');
    await wizard.next().click();
    await expect(wizard.error('Enter a number above 0')).toBeVisible();
    await wizard.valueField(0).fill('-5');
    await wizard.next().click();
    await expect(wizard.error('Enter a number above 0')).toBeVisible();

    // Multiply refuses zero.
    await wizard.chooseModifier(0, 'Multiply by');
    await wizard.valueField(0).fill('0');
    await wizard.next().click();
    await expect(wizard.error('Enter a number above 0')).toBeVisible();

    // Lifting the limit hides the value.
    await wizard.chooseModifier(0, 'Make unlimited');
    await expect(wizard.valueField(0)).toHaveCount(0);

    // Set accepts zero.
    await wizard.chooseModifier(0, 'Set to');
    await wizard.valueField(0).fill('0');
    await wizard.next().click();
    await wizard.expectStep('Who and when');
  });

  test('refuses the same entitlement twice, on the line that repeats it', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Boost', 'Twice');
    await wizard.addChange().click();
    await wizard.chooseEntitlement(0, 'Tokens');
    await wizard.valueField(0).fill('10');
    await wizard.addChange().click();
    await wizard.chooseEntitlement(1, 'Tokens');
    await wizard.valueField(1).fill('20');

    await wizard.next().click();

    await expect(
      wizard.error('This entitlement is already changed by another line'),
    ).toBeVisible();
    await wizard.expectStep('Offer');
  });

  test('counts the billing periods when the offer repeats', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Boost', 'Periods');

    await wizard.chooseDuration('A number of times');

    await expect(wizard.timesField()).toHaveAccessibleName(
      /Number of billing periods/,
    );
  });
});

test.describe('the code, the conditions and the limits', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
    await installVouchersWorld(page);
  });

  async function toEligibility(wizard: VoucherWizardDriver) {
    await wizard.goto();
    await wizard.startAs('Discount', 'Spring');
    await wizard.percentageField().fill('20');
    await wizard.next().click();
    await wizard.expectStep('Who and when');
  }

  test('warns of a short code that has no maximum and no end, before the API refuses it, and stops warning once it is bounded', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await toEligibility(wizard);

    await wizard.codeField().fill('SPRING2027');
    await expect(wizard.weakCodeWarning()).toContainText(
      'A short code can be guessed',
    );

    await wizard.maxRedemptionsField().fill('100');
    await expect(wizard.weakCodeWarning()).toHaveCount(0);
  });

  test('lets the person publish it all the same, and shows what the API says on the code when it refuses it', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    const writes = recordWrites(page, MAKING);
    await toEligibility(wizard);
    await wizard.codeField().fill('SPRING2027');
    await wizard.next().click();
    await wizard.expectStep('Review');

    await wizard.publishButton().click();

    // The API refuses a short code with no bound; the wizard goes back to the step that has it.
    await wizard.expectStep('Who and when');
    await expect(wizard.error(/code/i).first()).toBeVisible();
    await expect(wizard.codeField()).toHaveValue('SPRING2027');
    expect(
      writes.map(({ method, pathname }) => `${method} ${pathname}`),
    ).toEqual(['POST /api/vouchers']);

    await wizard.maxRedemptionsField().fill('100');
    await wizard.next().click();
    await wizard.publishButton().click();

    await expect(wizard.published()).toBeVisible();
    // The button that published is gone with the wizard: the keyboard is not left on nothing.
    await expect(wizard.published()).toBeFocused();
  });

  test('refuses a code the API would, and a code that is taken, on the code', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await toEligibility(wizard);

    await wizard.codeField().fill('SHORT');
    await wizard.next().click();
    await expect(
      wizard.error(
        'Use 8 to 64 letters, digits, dashes or underscores, or leave it empty',
      ),
    ).toBeVisible();

    // Another voucher has this one, compared without case or separators.
    await wizard.codeField().fill('welcome spring 2027'.replace(/ /g, '-'));
    await wizard.maxRedemptionsField().fill('10');
    await wizard.next().click();
    await wizard.publishButton().click();

    await wizard.expectStep('Who and when');
    await expect(wizard.error(/another voucher has this code/i)).toBeVisible();
  });

  test('reserves a voucher for a customer, by name', async ({ page }) => {
    const wizard = new VoucherWizardDriver(page);
    await toEligibility(wizard);

    await wizard.reserveFor('Hooli');
    await wizard.next().click();

    await expect(wizard.review()).toContainText('It is reserved for Hooli.');
  });
});

test.describe('the review and the publication', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
  });

  test('reads a discount in plain language, naming what it counts, and sends the voucher and then its publication', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    const writes = recordWrites(page, MAKING);
    await installVouchersWorld(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Thirty off');
    await wizard.percentageField().fill('30');
    await wizard.chooseDuration('A number of times');
    await wizard.timesField().fill('12');
    await wizard.next().click();
    await wizard.codeField().fill('VENDOR-30-OFF-12');
    await wizard.maxRedemptionsField().fill('100');
    await wizard.next().click();

    await wizard.expectStep('Review');
    await expect(wizard.review()).toContainText(
      '30% off the base price, on the next 12 invoices.',
    );
    await expect(wizard.review()).toContainText(
      'It can be redeemed 100 times.',
    );
    await expect(wizard.review()).toContainText(
      'Any customer can redeem it, once per instance.',
    );
    await expect(wizard.reviewCode('VENDOR-30-OFF-12')).toBeVisible();
    expect(writes).toEqual([]);

    await wizard.publishButton().click();

    await expect(wizard.published()).toBeVisible();
    expect(
      writes.map(({ method, pathname }) => `${method} ${pathname}`),
    ).toEqual([
      'POST /api/vouchers',
      expect.stringMatching(/^POST \/api\/vouchers\/[^/]+\/publish$/),
    ]);
    expect(writes[0].body).toMatchObject({
      code: 'VENDOR-30-OFF-12',
      duration: 'REPEATING',
      durationInPeriods: 12,
      maxRedemptions: 100,
      name: 'Thirty off',
      priceAppliesTo: 'LICENSE_BASE',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '30',
      voucherType: 'PRICE',
    });
  });

  test('shows the code with a button to copy it, and keeps it out of the address', async ({
    page,
    context,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await installVouchersWorld(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Generated');
    await wizard.percentageField().fill('10');
    await wizard.next().click();
    await wizard.next().click();
    await expect(
      wizard.reviewCode('A code is generated when you publish'),
    ).toBeVisible();

    await wizard.publishButton().click();

    await expect(wizard.published()).toBeVisible();
    const code = await wizard.code().inputValue();
    expect(code).toMatch(/^[A-Z0-9]{16}$/);
    await wizard.copyButton().click();
    await expectToast(page, 'Code copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      code,
    );
    expect(page.url()).not.toContain(code);
    expect(page.url()).toMatch(/\/vouchers\/new$/);
  });

  test('makes a boost with a generated code, and publishes it', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    const writes = recordWrites(page, MAKING);
    await installVouchersWorld(page);
    await wizard.goto();
    await wizard.startAs('Boost', 'Tokens times two');
    await wizard.addChange().click();
    await wizard.chooseEntitlement(0, 'Tokens');
    await wizard.chooseModifier(0, 'Multiply by');
    await wizard.valueField(0).fill('2');
    await wizard.chooseDuration('A number of times');
    await wizard.timesField().fill('2');
    await wizard.next().click();
    await wizard.next().click();

    await expect(wizard.review()).toContainText(
      'Tokens × 2, for 2 billing periods.',
    );
    await wizard.publishButton().click();

    await expect(wizard.published()).toBeVisible();
    expect(writes[0].body).toMatchObject({
      duration: 'REPEATING',
      durationInPeriods: 2,
      grants: [
        {
          entitlementSlug: 'tokens',
          modifierType: 'MULTIPLY',
          modifierValue: '2',
        },
      ],
      voucherType: 'ENTITLEMENT_BOOST',
    });
    // A boost is not offered a boost.
    await expect(wizard.addBoostLink()).toHaveCount(0);
  });

  test('offers a boost for the same offer after a discount, starting from its duration and its limits', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await installVouchersWorld(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Launch');
    await wizard.percentageField().fill('20');
    await wizard.chooseDuration('A number of times');
    await wizard.timesField().fill('3');
    await wizard.next().click();
    await wizard.maxRedemptionsField().fill('40');
    await wizard.next().click();
    await wizard.publishButton().click();
    await expect(wizard.published()).toBeVisible();

    await wizard.addBoostLink().click();

    await expect(page).toHaveURL(/\/vouchers\/new\?boostFor=voucher-/);
    await wizard.expectStep('Offer');
    await expect(wizard.timesField()).toHaveValue('3');
    await expect(wizard.timesField()).toHaveAccessibleName(/billing periods/);
    await wizard.addChange().click();
    await wizard.chooseEntitlement(0, 'Seats');
    await wizard.valueField(0).fill('5');
    await wizard.next().click();
    await expect(wizard.maxRedemptionsField()).toHaveValue('40');
    await wizard.next().click();
    await expect(wizard.review()).toContainText(
      'Seats + 5, for 3 billing periods.',
    );
    await wizard.stepper('Kind').click();
    await expect(wizard.nameField()).toHaveValue('Launch (boost)');
  });

  test('starts over, empty, from the page that follows a publication', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await installVouchersWorld(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'First');
    await wizard.percentageField().fill('5');
    await wizard.next().click();
    await wizard.next().click();
    await wizard.publishButton().click();
    await expect(wizard.published()).toBeVisible();

    await wizard.makeAnother().click();

    await expect(wizard.nameField()).toHaveValue('');
    await wizard.expectStep('Kind');
  });

  test('keeps the voucher as a draft that is finished where it was made', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    const detail = new VoucherDetailDriver(page);
    const writes = recordWrites(page, MAKING);
    await installVouchersWorld(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Later');
    await wizard.percentageField().fill('12');
    await wizard.next().click();
    await wizard.next().click();

    await wizard.saveDraftButton().click();

    await detail.expectLoaded('Later');
    await detail.expectState('Draft');
    expect(writes.map(({ method }) => method)).toEqual(['POST']);
    await detail.editLink().click();
    await expect(page).toHaveURL(/\/vouchers\/voucher-[^/]+\/edit$/);
    await expect(wizard.review()).toContainText('12% off the base price');
    await wizard.expectStep('Review');
    await wizard.publishButton().click();
    await expect(wizard.published()).toBeVisible();
    expect(
      writes.map(
        ({ method, pathname }) =>
          `${method} ${pathname.replace(/voucher-\d+/, 'voucher-N')}`,
      ),
    ).toEqual([
      'POST /api/vouchers',
      'PUT /api/vouchers/voucher-N',
      'POST /api/vouchers/voucher-N/publish',
    ]);
  });

  test('keeps the draft when the publication is refused, and sends it again, not a second voucher, on retry', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    const writes = recordWrites(page, MAKING);
    const model = createVouchersBillingModel();
    model.vouchers.armProblem('publishVoucher', {
      code: 'Billing.Unavailable',
      detail: 'Billing is being moved.',
      status: 503,
    });
    await installVouchersWorld(page, model);
    await wizard.goto();
    await wizard.startAs('Discount', 'Retried');
    await wizard.percentageField().fill('8');
    await wizard.next().click();
    await wizard.next().click();

    await wizard.publishButton().click();

    await expect(page.getByText('Billing is being moved.')).toBeVisible();
    await expect(page.getByText(/saved as a draft/)).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();

    await expect(wizard.published()).toBeVisible();
    expect(
      writes.map(
        ({ method, pathname }) =>
          `${method} ${pathname.replace(/voucher-\d+/, 'voucher-N')}`,
      ),
    ).toEqual([
      'POST /api/vouchers',
      'POST /api/vouchers/voucher-N/publish',
      'PUT /api/vouchers/voucher-N',
      'POST /api/vouchers/voucher-N/publish',
    ]);
  });

  test('goes back to the first step that has something to fix when a step it left was broken since', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    const writes = recordWrites(page, MAKING);
    await installVouchersWorld(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Broken');
    await wizard.percentageField().fill('9');
    await wizard.next().click();
    await wizard.next().click();
    await wizard.expectStep('Review');

    await wizard.stepper('Offer').click();
    await wizard.percentageField().fill('');
    await wizard.stepper('Review').click();

    await expect(
      wizard.error('Enter a percentage above 0 and up to 100'),
    ).toBeVisible();
    await wizard.expectStep('Offer');
    expect(writes).toEqual([]);
  });
});
