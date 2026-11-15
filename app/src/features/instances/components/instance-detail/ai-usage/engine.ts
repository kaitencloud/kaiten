/**
 * The pricing engine as the AI usage tab and its receipt use it: no component
 * adds, multiplies or rounds a price. This file lists what the tab takes from
 * the domain's engine, in one place.
 */
export {
  AI_REQUEST_TYPES,
  RATE_KEY_OF,
  costPerCredit,
  findModelByRef,
  margin,
  normalizeRefundAmount,
  parseDecimal,
  readDecimalInput,
  reconstructReceipt,
  refundAmountIssue,
  refundableCredits,
  sameDecimal,
  steerOnCost,
  vendorCost,
  vendorCostDrift,
  type DenialReason,
  type PriceLine,
  type Priced,
  type PricingRule,
  type PricingTerms,
  type ReceiptReconstruction,
  type Specificity,
  type VendorCostResult,
} from '@/domains/ai-credits';
