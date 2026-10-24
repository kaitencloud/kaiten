import { z } from 'zod';
import { zCreateConversionRule } from '@/api-client/zod.gen';
import { maximumBelowMinimum } from './pricing-preview';

export const ruleFormSchema = zCreateConversionRule
  .extend({
    chargeOnError: zCreateConversionRule.shape.chargeOnError
      .removeDefault()
      .unwrap(),
    minimumCreditsPerRequest:
      zCreateConversionRule.shape.minimumCreditsPerRequest
        .removeDefault()
        .unwrap(),
    modelSlug: z.string(),
    requestType: z.enum([
      'ANY',
      'COMPLETION',
      'EMBEDDING',
      'IMAGE_GENERATION',
      'AUDIO',
      'VIDEO',
    ]),
  })
  .superRefine((value, ctx) => {
    if (!Object.values(value.rates).some((rate) => rate != null && rate !== ''))
      ctx.addIssue({ code: 'custom', path: ['rates'], message: 'AI.noRate' });
    if (
      value.maximumCreditsPerRequest != null &&
      maximumBelowMinimum(
        value.minimumCreditsPerRequest,
        value.maximumCreditsPerRequest,
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['maximumCreditsPerRequest'],
        message: 'AI.invalidMaximum',
      });
  });
