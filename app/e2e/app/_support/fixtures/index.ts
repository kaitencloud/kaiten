/**
 * Shared fixture builders for E2E scenario factories.
 *
 * These functions create minimal, type-safe test data objects with sensible defaults.
 * Import from this barrel instead of duplicating builders across scenario files.
 *
 * Usage:
 * ```ts
 * import { buildCustomer, buildLicense, TEST_USER } from '../_support/fixtures';
 * ```
 */
export { buildAddon, buildAddonGrant, buildInstanceAddon } from './build-addon';
export { buildCustomer, TEST_USER } from './build-customer';
export { buildDeploymentZone } from './build-deployment-zone';
export { NULL_LINE_MEMBERS } from './build-invoice';
export { buildLicense } from './build-license';
export { NULL_OBJECT } from './null-object';
export { buildPublishableKey } from './build-publishable-key';
export { buildEntitlement, buildGrant, buildPrice } from './build-pricing';
export {
  buildRedemption,
  buildVoucher,
  normalizeVoucherCode,
  voucherCodeHint,
} from './build-voucher';
export {
  buildSubscription,
  buildUpcomingInvoice,
  PRO_MONTHLY_PRICE,
} from './build-subscription';
