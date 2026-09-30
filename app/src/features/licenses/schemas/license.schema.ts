import { z } from 'zod';
import { zLicenseWritable } from '@/api-client/zod.gen';

// Accept an empty string so the optional slug can be left blank in the form.
const optionalField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema.or(z.literal(''));

// Form schema derived from the generated API schema.
// isDefault is not a user-editable field — it is set programmatically at submission.
// version is not a form field: the API assigns it when a version is created
// and never changes it afterwards (readOnly), since the version's slug is
// derived from it.
export const licenseFormSchema = zLicenseWritable
  .pick({
    name: true,
    description: true,
    type: true,
    versionName: true,
  })
  .extend({
    // Override with i18n-friendly validation messages
    name: z.string().min(1, 'Pages.Licenses.Mutation.Form.Errors.name'),
    // Optional — left empty, the API generates the slug.
    slug: optionalField(zLicenseWritable.shape.slug.unwrap()),
    // Create only: the state a new license starts in. After that it moves
    // through publish, archive and unarchive, never through the form.
    createAsDraft: z.boolean(),
  });

export type LicenseFormValues = z.infer<typeof licenseFormSchema>;
