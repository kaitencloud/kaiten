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
export { buildCheckoutSession } from './build-checkout-session';
export { buildCustomer, SYSTEM_USER, TEST_USER } from './build-customer';
export { buildDeploymentZone } from './build-deployment-zone';
export { NULL_LINE_MEMBERS } from './build-invoice';
export { buildLicense } from './build-license';
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
export {
  AI_GRANTS,
  AI_POOL,
  AI_RULE_EDITOR,
  EMPTY_POOL,
  PARTNER_POOL,
  aiRuleId,
  buildAiGrants,
  buildAiModels,
  buildAiPools,
  buildAiRules,
} from './build-ai-catalogue';
export {
  type AiAddonGrant,
  type AiAddonGrantSeed,
  buildAiAddonGrants,
} from './build-ai-addon-grants';
export {
  buildLargeAiGrants,
  buildLargeAiModels,
  buildLargeAiRules,
  buildLargeAiVersions,
} from './build-ai-large-catalogue';
export {
  AI_SUPPORT_USER,
  AI_USAGE,
  type AiInferenceRecord,
  aiPricingSnapshot,
  buildAiEntitlementUsages,
  buildAiInferences,
} from './build-ai-usage';
