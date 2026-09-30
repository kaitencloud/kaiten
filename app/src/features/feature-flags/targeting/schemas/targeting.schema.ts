import { z } from 'zod';
import {
  zBasicTargeting,
  zRolloutDateTargeting,
  zRolloutPercentageTargeting,
} from '@/api-client/zod.gen';
import { validateDistribution } from '../utils/cel-validator';

/**
 * Form schemas for targeting
 * These schemas are used for form validation and differ from API schemas
 * by using number instead of bigint for percentages
 */

// Base schema for all targeting form types — extends generated zBasicTargeting.
//
// The rule's only sync check is that it exists. Whether it is a *good* rule is
// the server lint's to say — an async field validator wired where the field is
// declared (targeting-base-fields) — because the client-side parser this used
// to run disagreed with the server on what CEL is, and put its raw token-dump
// errors ("Expecting: one of these possible Token sequences…") in front of the
// author.
const baseTargetingFormSchema = zBasicTargeting
  .pick({ name: true, rule: true })
  .extend({
    name: z.string().min(1, 'Features.Targeting.Errors.nameRequired'),
    rule: z.string().min(1, 'Features.Targeting.Errors.ruleRequired'),
  });

// BasicTargeting form schema
export const basicTargetingFormSchema = baseTargetingFormSchema.extend({
  type: z.literal('basic'),
  variant: z.string().min(1, 'Features.Targeting.Errors.variantRequired'),
});

// RolloutDateTargeting form schema (using number for percentages)
export const rolloutDateTargetingFormSchema = baseTargetingFormSchema.extend({
  type: z.literal('rollout_date'),
  start: z.object({
    date: z.string().min(1, 'Features.Targeting.Errors.startDateRequired'),
    percentage: z
      .union([z.string(), z.number()])
      .transform((val) => {
        if (val === '' || val === undefined || val === null) return undefined;
        const n = Number(val);
        return Number.isNaN(n) ? NaN : n;
      })
      .superRefine((val, ctx) => {
        if (val === undefined) {
          ctx.addIssue({
            code: 'custom',
            message: 'Features.Targeting.Errors.percentageRequired',
          });
          return;
        }
        if (typeof val !== 'number' || Number.isNaN(val)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Features.Targeting.Errors.percentageInvalid',
          });
          return;
        }
        if (val < 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'Features.Targeting.Errors.percentageMin',
          });
        }
        if (val > 100) {
          ctx.addIssue({
            code: 'custom',
            message: 'Features.Targeting.Errors.percentageMax',
          });
        }
      }),
    variant: z
      .string()
      .min(1, 'Features.Targeting.Errors.startVariantRequired'),
  }),
  end: z.object({
    date: z.string().min(1, 'Features.Targeting.Errors.endDateRequired'),
    percentage: z
      .union([z.string(), z.number()])
      .transform((val) => {
        if (val === '' || val === undefined || val === null) return undefined;
        const n = Number(val);
        return Number.isNaN(n) ? NaN : n;
      })
      .superRefine((val, ctx) => {
        if (val === undefined) {
          ctx.addIssue({
            code: 'custom',
            message: 'Features.Targeting.Errors.percentageRequired',
          });
          return;
        }
        if (typeof val !== 'number' || Number.isNaN(val)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Features.Targeting.Errors.percentageInvalid',
          });
          return;
        }
        if (val < 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'Features.Targeting.Errors.percentageMin',
          });
        }
        if (val > 100) {
          ctx.addIssue({
            code: 'custom',
            message: 'Features.Targeting.Errors.percentageMax',
          });
        }
      }),
    variant: z.string().min(1, 'Features.Targeting.Errors.endVariantRequired'),
  }),
});

// RolloutPercentageTargeting form schema with distribution validation
export const rolloutPercentageTargetingFormSchema = baseTargetingFormSchema
  .extend({
    type: z.literal('rollout_percentage'),
    distribution: z.record(z.string(), z.number().min(0).max(100)),
  })
  .refine((data) => validateDistribution(data.distribution), {
    message: 'Features.Targeting.Errors.distributionSum',
    path: ['distribution'],
  });

// API schemas (re-exported from zod.gen.ts for convenience)
export const basicTargetingSchema = zBasicTargeting;
export const rolloutDateTargetingSchema = zRolloutDateTargeting;
export const rolloutPercentageTargetingSchema = zRolloutPercentageTargeting;

// Union schema for API
export const targetingSchema = z.discriminatedUnion('type', [
  basicTargetingSchema,
  rolloutDateTargetingSchema,
  rolloutPercentageTargetingSchema,
]);

/**
 * Validates a targeting object against the API schema
 * @param targeting - The targeting object to validate
 * @returns Zod SafeParseReturnType with success/error information
 */
export function validateTargeting(targeting: unknown) {
  return targetingSchema.safeParse(targeting);
}

// Re-export for convenience
export { validateDistribution };
