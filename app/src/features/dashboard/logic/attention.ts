// What the summary says needs attention, per view: the Customers builder, the
// Integration builder and what both share (the line type, the paths a line
// leads to, the labels of the checks).
export { buildCustomersAttention } from './attention-customers';
export { buildIntegrationAttention } from './attention-integration';
export {
  type AttentionAction,
  type AttentionLine,
  type AttentionTone,
  billingStatusKey,
  CUSTOMERS_CHECKS,
  INTEGRATION_CHECKS,
  quietChecks,
  instanceEntitlementsPath,
  instancePath,
} from './attention-shared';
