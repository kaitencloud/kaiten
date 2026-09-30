import { z } from 'zod';
import { zComponentWritable } from '@/api-client/zod.gen';

const optionalField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema.or(z.literal(''));

export const componentFormSchema = zComponentWritable
  .omit({
    previousComponentId: true,
  })
  .extend({
    description: optionalField(zComponentWritable.shape.description.unwrap()),
    name: z
      .string()
      .trim()
      .min(1, 'Pages.Releases.Components.Form.Errors.nameRequired')
      .max(100),
    slug: optionalField(zComponentWritable.shape.slug.unwrap()),
    version: z
      .string()
      .trim()
      .min(1, 'Pages.Releases.Components.Form.Errors.versionRequired')
      .max(100),
  });

export type ComponentFormValues = z.infer<typeof componentFormSchema>;

export const initialComponentFormValues: ComponentFormValues = {
  description: '',
  name: '',
  slug: '',
  version: '',
};

const toOptionalValue = (value: string) => {
  const trimmedValue = value.trim();
  return trimmedValue === '' ? undefined : trimmedValue;
};

export function normalizeComponentFormValues(
  value: ComponentFormValues,
): z.infer<typeof zComponentWritable> {
  return {
    description: toOptionalValue(value.description),
    name: value.name.trim(),
    slug: toOptionalValue(value.slug),
    version: value.version.trim(),
  };
}
