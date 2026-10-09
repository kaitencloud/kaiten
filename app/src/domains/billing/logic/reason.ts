import { z } from 'zod';

/** The longest reason an audited action takes, as the API counts it. */
export const REASON_MAX_LENGTH = 500;

/**
 * The reason an audited action requires: one to five hundred characters of
 * something a person wrote, so that spaces alone are not one. The message is a
 * translation key, as every validation message is.
 */
export const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Features.Billing.Reason.Errors.required')
  .max(REASON_MAX_LENGTH, 'Features.Billing.Reason.Errors.tooLong');
