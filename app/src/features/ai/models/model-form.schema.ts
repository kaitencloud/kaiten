import { zModelWritable } from '@/api-client/zod.gen';

export const modelFormSchema = zModelWritable.extend({
  name: zModelWritable.shape.name.min(1, 'AI.nameRequired'),
  vendor: zModelWritable.shape.vendor.min(1, 'AI.vendorRequired'),
  slug: zModelWritable.shape.slug
    .min(2, 'AI.slugInvalid')
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'AI.slugInvalid'),
  status: zModelWritable.shape.status.removeDefault(),
  vendorCosts: zModelWritable.shape.vendorCosts
    .unwrap()
    .extend({
      currency: zModelWritable.shape.vendorCosts
        .unwrap()
        .shape.currency.removeDefault(),
    })
    .optional(),
});
