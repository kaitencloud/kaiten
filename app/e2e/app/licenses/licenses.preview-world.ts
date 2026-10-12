import type { Page } from '@playwright/test';
import type { UsageReport } from '@/api-client';
import { buildUsageReport } from '../_support/fixtures/build-invoice';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import type { LicenseAppModel } from '../_support/model/license-app-model';
import {
  createVouchersBillingModel,
  createVouchersInstancesModel,
  createVouchersLicensesModel,
} from '../vouchers/vouchers.scenarios';

/**
 * The world the preview of an invoice names add-ons, instances and vouchers from: the
 * vouchers world (the Pro, Starter and Enterprise licenses, the add-ons sold on top of them,
 * the instances that hold them and the vouchers in every state), with the journal of the
 * tokens Initech Production reported. The specs freeze the page at `BILLED_NOW`
 * (2026-10-07T12:00Z), and the subscription of Initech Production is in the period that began on
 * September 15th.
 *
 * - Pro costs $99.00 a month, grants a hundred thousand tokens with a fifty percent overage,
 *   and rates nothing on them: the tokens are rated by the add-on that adds some;
 * - Extra tokens adds ten thousand tokens a unit, with an overage of twenty percent of its own,
 *   sells a fee of $5.00 a month and rates each token at a tenth of a cent;
 * - Extra seats sells a fee of $10.00 a month a unit;
 * - Initech Production reported 115,000 tokens since September 15th, ten thousand of them above
 *   the limit (September's window floors at nothing what October's window adds);
 * - the welcome promotion, WELCOME-SPRING-2027, takes twenty percent off the base price; the
 *   summer sale is a draft, and the launch boost is not a discount at all.
 */

export const PRO = 'pro';

// A report names the instance and the entitlement it is of by UUID, as the API does.
const AI_USAGE_ENTITLEMENT_ID = '8a1d4c3e-7b52-4a8c-b1f0-6e2d9c4a7f55';
const INITECH_PROD_ID = '2f6c8e0a-5d1b-4f43-9f55-3a1c5e0d7b33';

const SEPTEMBER = {
  windowEnd: '2026-10-01T00:00:00.000Z',
  windowStart: '2026-09-01T00:00:00.000Z',
};
const OCTOBER = {
  windowEnd: '2026-11-01T00:00:00.000Z',
  windowStart: '2026-10-01T00:00:00.000Z',
};

const report = (
  seq: number,
  reportedAt: string,
  before: number,
  delta: number,
  overage: number,
  window: typeof SEPTEMBER,
): UsageReport =>
  buildUsageReport({
    ...window,
    delta: String(delta),
    entitlementId: AI_USAGE_ENTITLEMENT_ID,
    instanceId: INITECH_PROD_ID,
    limitValue: '100000',
    overageDelta: String(overage),
    reportSeq: seq,
    reportedAt,
    reportedValue: String(delta),
    valueAfter: String(before + delta),
    valueBefore: String(before),
  });

/** The tokens Initech Production reported: 110,000 in September and 5,000 in October. */
export const initechTokens = (): UsageReport[] => [
  report(1, '2026-09-20T10:00:00.000Z', 0, 70_000, 0, SEPTEMBER),
  report(2, '2026-09-28T10:00:00.000Z', 70_000, 40_000, 10_000, SEPTEMBER),
  report(3, '2026-10-03T10:00:00.000Z', 0, 5_000, 0, OCTOBER),
];

/**
 * Installs the three slots of the world. `licenses` is the model of the licenses when a spec
 * arms a refusal on it, and `retentionStart` where the usage the organization keeps begins: a
 * spec moves it past the start of the period to see the usage refused.
 */
export async function installPreviewWorld(
  page: Page,
  {
    licenses = createVouchersLicensesModel(),
    retentionStart,
  }: { licenses?: LicenseAppModel; retentionStart?: string } = {},
) {
  await installInstanceAppMocks(
    page,
    createVouchersInstancesModel({
      retentionStart,
      usageReports: { 'initech-prod': { tokens: initechTokens() } },
    }),
  );
  await installLicenseAppMocks(page, licenses);
  await installBillingAppMocks(page, createVouchersBillingModel());
}
