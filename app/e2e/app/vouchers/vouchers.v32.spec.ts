import { expect, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { VoucherWizardDriver } from '../_support/drivers/voucher-wizard.driver';
import { VoucherDetailDriver } from '../_support/drivers/voucher-detail.driver';
import { BILLED_NOW } from '../billing/billed-instances';
import { installVouchersWorld } from './install-vouchers-world';
import { createVouchersBillingModel } from './vouchers.scenarios';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
});

test('creates a flag voucher with its variant and no other family', async ({
  page,
}) => {
  await installVouchersWorld(page);
  const writes = recordWrites(page, /\/api\/vouchers$/);
  const wizard = new VoucherWizardDriver(page);
  await wizard.goto();
  await wizard.nameField().fill('Preview flags');
  await wizard.kind('Feature grant').click();
  await wizard.next().click();
  await page.getByRole('button', { name: 'Add a feature grant' }).click();
  await page.getByRole('combobox', { name: 'Feature flag' }).click();
  await page.getByRole('option', { name: 'Beta Access' }).click();
  await page.getByRole('combobox', { name: 'Variant' }).click();
  await page.getByRole('option', { name: 'beta', exact: true }).click();
  await wizard.next().click();
  await wizard.next().click();
  await expect(page.getByTestId('voucher-review')).toContainText(
    'beta-access: beta',
  );
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByTestId('voucher-code')).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]?.body).toMatchObject({
    voucherType: 'FLAG_GRANT',
    flagGrants: [{ flagSlug: 'beta-access', variant: 'beta' }],
  });
  expect(writes[0]?.body).not.toHaveProperty('priceDiscountType');
});

test('reads each composite family and finishes a draft through its deep link', async ({
  page,
}) => {
  const billing = createVouchersBillingModel();
  const voucher = billing.vouchers.createVoucher({
    name: 'Bundle v32',
    voucherType: 'COMPOSITE',
    duration: 'ONE_TIME',
    priceDiscountType: 'PERCENTAGE',
    priceDiscountValue: '20',
    priceAppliesTo: 'LICENSE_BASE',
    grants: [
      { entitlementSlug: 'tokens', modifierType: 'ADD', modifierValue: '100' },
    ],
    flagGrants: [{ flagSlug: 'beta-access', variant: 'beta' }],
  });
  await installVouchersWorld(page, billing);
  const detail = new VoucherDetailDriver(page);
  await detail.goto(voucher.id, voucher.name);
  await expect(detail.summary()).toContainText('20%');
  await expect(detail.summary()).toContainText('Tokens + 100');
  await expect(detail.summary()).toContainText('beta-access: beta');
  await page.goto(`/catalog/vouchers/${voucher.id}/edit`);
  await expect(page.getByTestId('voucher-review')).toContainText(
    'beta-access: beta',
  );
  const writes = recordWrites(page, new RegExp(`/vouchers/${voucher.id}$`));
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByTestId('voucher-code')).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]?.body).toMatchObject({
    voucherType: 'COMPOSITE',
    flagGrants: [{ flagSlug: 'beta-access', variant: 'beta' }],
    grants: [
      { entitlementSlug: 'tokens', modifierType: 'ADD', modifierValue: '100' },
    ],
  });
});
