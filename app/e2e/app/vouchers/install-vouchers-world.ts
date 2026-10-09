import type { Page } from '@playwright/test';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createVouchersBillingModel,
  createVouchersInstancesModel,
  createVouchersLicensesModel,
} from './vouchers.scenarios';

/**
 * The three slots of the vouchers world: what the instances are entitled to, the
 * licenses and the catalogue of entitlements the vouchers name, and the billing slot
 * that holds the vouchers and what each instance redeemed of them. A spec that needs the
 * billing to be something else passes its own.
 */
export async function installVouchersWorld(
  page: Page,
  billing = createVouchersBillingModel(),
) {
  await installInstanceAppMocks(page, createVouchersInstancesModel());
  await installLicenseAppMocks(page, createVouchersLicensesModel());
  await installBillingAppMocks(page, billing);
}
