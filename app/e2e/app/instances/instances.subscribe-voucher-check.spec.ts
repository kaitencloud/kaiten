import { expect, test } from '../_support/app-test';
import {
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { recordWrites } from '../_support/assertions/requests';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceVouchersDriver } from '../_support/drivers/instance-vouchers.driver';
import { startInLanguage } from '../_support/language';
import { VALIDATION_RATE_LIMITED } from '../_support/model/billing-voucher-rules';
import { installVouchersWorld } from '../vouchers/install-vouchers-world';
import { createVouchersBillingModel } from '../vouchers/vouchers.scenarios';

// The code typed in the dialog that subscribes an instance can be checked against the price
// chosen before the subscription is sent: the same verdict the dialog that applies a code gives,
// asked with the price the subscription would start on, so that the rules that read the period,
// the amount and the currency read that subscription and not the one the instance has. A check
// writes nothing and never keeps the subscription from being sent, which carries the code and
// stays the authority. Initech Fresh was never subscribed, on Pro: $99.00 a month or $990.00 a
// year.

const CHECK_AND_SUBSCRIBE =
  /\/api\/(vouchers\/validate|instances\/[^/]+\/billing)$/;

test.beforeEach(async ({ page }) => {
  await new InstanceBillingDriver(page).freezeTime();
});

async function openDialog(
  page: Parameters<typeof installVouchersWorld>[0],
  billing = createVouchersBillingModel(),
) {
  await installVouchersWorld(page, billing);
  const subscription = new InstanceBillingDriver(page);
  await subscription.goto('initech-fresh');
  await subscription.openSubscribe();

  return {
    subscription,
    vouchers: new InstanceVouchersDriver(page),
  };
}

test.describe('checking the code of the dialog that subscribes', () => {
  test('asks about the code, the instance and the default price, shows the offer, and writes nothing', async ({
    page,
  }) => {
    const writes = recordWrites(page, CHECK_AND_SUBSCRIBE);
    const { subscription, vouchers } = await openDialog(page);
    await expect(vouchers.checkButton()).toBeDisabled();

    await vouchers.codeField().fill('WELCOME-SPRING-2027');
    await vouchers.checkButton().click();

    await expect(vouchers.validVerdict()).toContainText(
      'Welcome spring can be redeemed',
    );
    await expect(vouchers.validVerdict()).toContainText(
      'The subscription checks it again when it starts.',
    );
    // One request, to the validation, with the price the subscription would start on; the
    // code is in its body and in no address.
    expect(writes).toEqual([
      {
        body: {
          code: 'WELCOME-SPRING-2027',
          instanceSlug: 'initech-fresh',
          licensePriceId: 'price-pro-monthly',
        },
        method: 'POST',
        pathname: '/api/vouchers/validate',
      },
    ]);
    await expect(subscription.started()).toHaveCount(0);
  });

  test('reads the price chosen: a code for yearly subscriptions does not suit the monthly price, and suits the yearly one', async ({
    page,
  }) => {
    const writes = recordWrites(page, CHECK_AND_SUBSCRIBE);
    const { subscription, vouchers } = await openDialog(page);
    await vouchers.codeField().fill('ANNUAL-ONLY-15');

    await vouchers.checkButton().click();

    await expect(vouchers.invalidVerdict()).toContainText(
      'This code cannot be redeemed',
    );
    await expect(vouchers.invalidVerdict()).toContainText(/annual/i);
    // The verdict was about the monthly price: choosing the yearly one forgets it.
    await subscription.chooseBasePrice(/Pro, annual/);
    await expect(vouchers.invalidVerdict()).toHaveCount(0);
    await vouchers.checkButton().click();
    await expect(vouchers.validVerdict()).toContainText(
      'Annual only can be redeemed',
    );
    expect(
      writes.map(
        (write) => (write.body as { licensePriceId: string }).licensePriceId,
      ),
    ).toEqual(['price-pro-monthly', 'price-pro-annual']);
  });

  test('forgets the verdict when the code is edited, which it was not about', async ({
    page,
  }) => {
    const { vouchers } = await openDialog(page);
    await vouchers.codeField().fill('WELCOME-SPRING-2027');
    await vouchers.checkButton().click();
    await expect(vouchers.validVerdict()).toBeVisible();

    await vouchers.codeField().fill('WELCOME-SPRING-2028');

    await expect(vouchers.validVerdict()).toHaveCount(0);
  });

  test('says an unknown code is unknown, and still lets the subscription be sent with it, which the API refuses on the code', async ({
    page,
  }) => {
    const { subscription, vouchers } = await openDialog(page);
    await vouchers.codeField().fill('NOT-A-CODE-AT-ALL');

    await vouchers.checkButton().click();
    await expect(vouchers.invalidVerdict()).toContainText(
      'This code cannot be redeemed',
    );
    await subscription.confirmButton().click();

    // The subscription is the authority: it checks the code again and refuses it, on its field.
    await expect(subscription.started()).toHaveCount(0);
    await expect(vouchers.codeField()).toHaveValue('NOT-A-CODE-AT-ALL');
  });

  test('sends the subscription with the code as typed after a check that found it valid', async ({
    page,
  }) => {
    const writes = recordWrites(page, CHECK_AND_SUBSCRIBE);
    const { subscription, vouchers } = await openDialog(page);
    await vouchers.codeField().fill('WELCOME-SPRING-2027');
    await vouchers.checkButton().click();
    await expect(vouchers.validVerdict()).toBeVisible();

    await subscription.confirmButton().click();

    await expect(subscription.started()).toBeVisible();
    expect(writes.at(-1)).toMatchObject({
      body: {
        basePriceId: 'price-pro-monthly',
        voucherCode: 'WELCOME-SPRING-2027',
      },
      pathname: '/api/instances/initech-fresh/billing',
    });
  });

  test.describe('when the check is limited', () => {
    test('says it is temporary, in the words of the API, and checks again when asked', async ({
      page,
    }) => {
      const billing = createVouchersBillingModel();
      billing.vouchers.armProblem('validateVoucher', VALIDATION_RATE_LIMITED);
      const { vouchers } = await openDialog(page, billing);
      await vouchers.codeField().fill('WELCOME-SPRING-2027');

      await vouchers.checkButton().click();

      const alert = page.getByRole('dialog').getByRole('alert');
      await expect(alert).toContainText(
        'too many voucher codes checked: try again later',
      );
      await expect(alert).toContainText(
        'This is temporary: try again in a minute.',
      );
      await alert.getByRole('button', { name: 'Retry' }).click();
      await expect(vouchers.validVerdict()).toContainText(
        'Welcome spring can be redeemed',
      );
    });

    test('does not keep the subscription from being sent', async ({ page }) => {
      const billing = createVouchersBillingModel();
      billing.vouchers.armProblem('validateVoucher', VALIDATION_RATE_LIMITED);
      const { subscription, vouchers } = await openDialog(page, billing);
      await vouchers.codeField().fill('WELCOME-SPRING-2027');
      await vouchers.checkButton().click();
      await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
        'This is temporary',
      );

      await subscription.confirmButton().click();

      await expect(subscription.started()).toBeVisible();
    });
  });

  test('is said in French with the words of the console', async ({ page }) => {
    await startInLanguage(page, 'fr');
    await installVouchersWorld(page);
    await page.goto('/customers/instances/initech-fresh/billing/subscribe');
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel(/^Code promo/).fill('WELCOME-SPRING-2027');
    await dialog.getByRole('button', { name: 'Vérifier le code' }).click();

    await expect(page.getByTestId('redeem-verdict-valid')).toContainText(
      'Welcome spring peut être utilisé',
    );
    await expect(page.getByTestId('redeem-verdict-valid')).toContainText(
      'Il peut être utilisé avec cet abonnement, sur le prix choisi.',
    );
  });

  test('has no WCAG A/AA violation with a verdict shown, in either theme', async ({
    page,
  }) => {
    const { vouchers } = await openDialog(page);
    await vouchers.codeField().fill('WELCOME-SPRING-2027');
    await vouchers.checkButton().click();
    await expect(vouchers.validVerdict()).toBeVisible();

    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expect(vouchers.validVerdict()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);
  });
});
