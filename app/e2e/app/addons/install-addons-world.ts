import type { Page } from '@playwright/test';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createAddonsBillingModel,
  createAddonsInstancesModel,
  createAddonsLicensesModel,
} from './addons.scenarios';

/**
 * The three slots of the add-ons world: what the instances are entitled to, the license
 * families the add-ons fit and what their versions grant, and the billing slot that holds
 * the catalogue of add-ons and what each instance holds of it. A spec that needs the
 * billing to be something else passes its own.
 */
export async function installAddonsWorld(
  page: Page,
  billing = createAddonsBillingModel(),
) {
  await installInstanceAppMocks(page, createAddonsInstancesModel());
  await installLicenseAppMocks(page, createAddonsLicensesModel());
  await installBillingAppMocks(page, billing);
}
