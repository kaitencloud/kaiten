import { z } from 'zod';
import type {
  InstanceWritable,
  Instance,
  License,
  PatchInstanceBody,
} from '@/api-client';
import { zInstanceWritable } from '@/api-client/zod.gen';

const instanceCreateInput = zInstanceWritable.pick({
  name: true,
  description: true,
  customerId: true,
  startLicenseDate: true,
  endLicenseDate: true,
});

export const instanceDetailsFormSchema = instanceCreateInput
  .pick({
    name: true,
    description: true,
    customerId: true,
  })
  .extend({
    name: z.string().min(3),
    customerId: z.string().min(1),
  });

// Typed metadata, one key per active MetadataField. The shape is org-defined
// at runtime, so the form schema can only say "an object" -- the per-key
// validation is the JSON Schema each field carries, run by `validateDynamicForm`
// against the descriptors the page fetched.
export const instanceMetadataFormSchema = z.object({
  metadata: z.record(z.string(), z.unknown()),
});

export const instanceLicenseFormSchema = z.object({
  licenseSlug: z.string().min(1),
  licenseDate: z.object({
    from: z.date(),
    to: z.date(),
  }),
});

// The detail-view "instance details" card edits the commercial lifecycle stage
// alongside name/description/customer. Lifecycle stage is free-form and
// optional — an empty value means "leave unchanged" (clearing back to null is
// out of scope), so only a non-empty, changed value is persisted on save.
export const instanceDetailsEditFormSchema = instanceDetailsFormSchema.extend({
  lifecycleStage: z.string(),
});

// Accept an empty string so optional fields can be left blank in the form.
const optionalField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema.or(z.literal(''));

const toOptionalValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return !trimmed ? undefined : trimmed;
};

// The slug is exposed only on the creation form (the update body does not
// accept it). It is optional — left empty, the API generates one.
export const instanceFormSchema = instanceDetailsFormSchema
  .merge(instanceLicenseFormSchema)
  .merge(instanceMetadataFormSchema)
  .extend({
    slug: optionalField(zInstanceWritable.shape.slug.unwrap()),
    // An instance can be created without a zone and deployed later from the
    // instance list or its detail page, so this stays optional. It is exposed
    // on the creation form only: on an existing instance the zone changes
    // through the deploy/migrate action, which is what makes the API emit an
    // INSTANCE_DEPLOYMENT or INSTANCE_MIGRATION event.
    deploymentZoneId: optionalField(
      zInstanceWritable.shape.deploymentZoneId.unwrap(),
    ),
    // Commercial lifecycle stage is free-form and optional. It is persisted via a
    // dedicated PATCH (lifecycleStage), not the PUT body, so it lives on the
    // form values but is stripped from instanceFormValuesToInstanceInput.
    lifecycleStage: z.string(),
  });

export type InstanceDetailsFormValues = z.infer<
  typeof instanceDetailsFormSchema
>;
export type InstanceLicenseFormValues = z.infer<
  typeof instanceLicenseFormSchema
>;
export type InstanceMetadataFormValues = z.infer<
  typeof instanceMetadataFormSchema
>;
export type InstanceDetailsEditFormValues = z.infer<
  typeof instanceDetailsEditFormSchema
>;
export type InstanceFormValues = z.infer<typeof instanceFormSchema>;

export const initialInstanceFormValues: InstanceFormValues = {
  name: '',
  description: '',
  customerId: '',
  slug: '',
  deploymentZoneId: '',
  licenseSlug: '',
  metadata: {},
  lifecycleStage: '',
  licenseDate: {
    from: new Date(),
    to: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
  },
};

// Build the writable fields shared by the create and update bodies explicitly.
// Never spread the form values: when the form is seeded from an existing
// instance (instanceToFormValues), the values still carry server-only,
// read-only fields (status, createdAt, createdBy, updatedAt, updatedBy,
// customerSlug) that the API rejects with a 422 "unexpected property" — and a
// slug, which the update body accepts and would read as a rename request.
//
// `metadata` is sent whole. Instance metadata is tolerant (the SaaS auto-reports
// keys no MetadataField declares), and the PUT full-replaces it: the server
// re-injects archived keys on its own, but undeclared ones only survive because
// the metadata step keeps them in the form value alongside the typed fields.
const instanceFormValuesToWritableInput = (
  formValues: InstanceFormValues,
  licenses: License[],
): InstanceWritable => {
  const { name, description, customerId, licenseDate, licenseSlug, metadata } =
    formValues;
  const license = licenses.find((l) => l.slug === licenseSlug);
  return {
    name,
    description,
    customerId,
    licenseId: license!.id,
    metadata,
    startLicenseDate: licenseDate.from.toISOString(),
    endLicenseDate: licenseDate.to.toISOString(),
  };
};

export const instanceFormValuesToInstanceInput = (
  formValues: InstanceFormValues,
  licenses: License[],
): InstanceWritable => ({
  ...instanceFormValuesToWritableInput(formValues, licenses),
  deploymentZoneId: toOptionalValue(formValues.deploymentZoneId),
  slug: toOptionalValue(formValues.slug),
});

// The PUT body takes no read-only field, and its optional slug is left out on
// purpose: the console does not rename instances, and an absent slug keeps the
// current one.
//
// The deployment zone now comes from the form, but an emptied field falls back
// to the current zone rather than being sent as-is: the PUT cannot detach an
// instance from its zone — an omitted deploymentZoneId is exactly what "keep
// the current one" means — so clearing it would look like it did something and
// do nothing. The picker refuses to clear a zone that is already
// set for the same reason; this is the guard behind it.
export const instanceFormValuesToUpdateInput = (
  formValues: InstanceFormValues,
  licenses: License[],
  instance: Instance,
): InstanceWritable => ({
  ...instanceFormValuesToWritableInput(formValues, licenses),
  deploymentZoneId:
    toOptionalValue(formValues.deploymentZoneId) ?? instance.deploymentZoneId,
});

export const instanceToFormValues = (
  instance: Instance,
): InstanceFormValues => ({
  name: instance.name,
  description: instance.description,
  customerId: instance.customerId,
  slug: instance.slug ?? '',
  deploymentZoneId: instance.deploymentZoneId ?? '',
  licenseSlug: instance.licenseSlug,
  metadata: instance.metadata ?? {},
  lifecycleStage: instance.lifecycleStage ?? '',
  licenseDate: {
    from: new Date(instance.startLicenseDate ?? ''),
    to: new Date(instance.endLicenseDate ?? ''),
  },
});

export const instanceToDetailsFormValues = (
  instance: Instance,
): InstanceDetailsFormValues => ({
  name: instance.name,
  description: instance.description,
  customerId: instance.customerId,
});

export const instanceToLicenseFormValues = (
  instance: Instance,
): InstanceLicenseFormValues => ({
  licenseSlug: instance.licenseSlug,
  licenseDate: {
    from: new Date(instance.startLicenseDate),
    to: new Date(instance.endLicenseDate),
  },
});

export const instanceToMetadataFormValues = (
  instance: Instance,
): InstanceMetadataFormValues => ({
  metadata: instance.metadata ?? {},
});

export const instanceToDetailsEditFormValues = (
  instance: Instance,
): InstanceDetailsEditFormValues => ({
  ...instanceToDetailsFormValues(instance),
  lifecycleStage: instance.lifecycleStage ?? '',
});

export const instanceDetailsFormValuesToInstanceInput = (
  values: InstanceDetailsFormValues,
  instance: Instance,
): InstanceWritable => ({
  name: values.name,
  description: values.description,
  customerId: values.customerId,
  licenseId: instance.licenseId,
  deploymentZoneId: instance.deploymentZoneId,
  metadata: instance.metadata ?? {},
  startLicenseDate: instance.startLicenseDate,
  endLicenseDate: instance.endLicenseDate,
});

export const instanceLifecycleStageToPatchBody = (
  lifecycleStage: string,
): PatchInstanceBody => ({
  lifecycleStage,
});
