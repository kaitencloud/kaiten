import { defineFormRecovery } from '@/functionals/form-recovery';
import type { MetadataFieldDescriptor } from '@/functionals/metadata-fields';
import {
  type InstanceFormValues,
  instanceFormSchema,
} from '../../utils/instance-form.shared';

/** What the recovery of an instance reads of today's data: the metadata it may keep. */
export type InstanceRecoveryReferences = {
  metadataFields: readonly MetadataFieldDescriptor[];
};

const FORM = 'Pages.Customers.Instances.Mutation.Form';

/** The steps of the creation, by id and in order; the last only where metadata is declared. */
export const INSTANCE_RECOVERY_STEPS = [
  'details',
  'license',
  'deployment',
  'metadata',
] as const;

/** The titles of the steps, for the offer: "step 2 (Choose the license)". */
export const INSTANCE_RECOVERY_STEP_LABEL_KEYS = [
  `${FORM}.Steps.instanceInformations`,
  `${FORM}.Steps.chooseLicense`,
  `${FORM}.Steps.deployment`,
  `${FORM}.Steps.metadata`,
] as const satisfies readonly string[];

/**
 * Whether a metadata value must stay off the device: the organization defines these
 * fields, so the descriptor decides from its JSON Schema, a `writeOnly` field or a
 * `password` one being a secret. Until the descriptors are read, the whole metadata is
 * kept out, and so is a key no descriptor declares.
 */
export function isSecretMetadata(
  path: readonly string[],
  fields: readonly MetadataFieldDescriptor[] | undefined,
): boolean {
  if (path[0] !== 'metadata') {
    return false;
  }
  if (fields === undefined) {
    return true;
  }
  if (path.length < 2) {
    return false;
  }
  const field = fields.find((candidate) => candidate.key === path[1]);

  return (
    field === undefined ||
    field.jsonSchema.writeOnly === true ||
    field.jsonSchema.format === 'password'
  );
}

/**
 * What the creation of an instance keeps when it is left unsent: its details, its
 * license and dates, its zone and the metadata that is no secret (`isSecretMetadata`).
 * The context names the customer the dialog was opened for, so that an input begun for
 * one is never offered for another; the id only, never its name. The edit of an
 * instance keeps nothing.
 */
export const instanceRecovery = defineFormRecovery<
  InstanceFormValues,
  InstanceRecoveryReferences
>({
  formId: 'instances.create',
  version: 1,
  omit: [],
  omitWhen: (path, _value, references) =>
    isSecretMetadata(path, references.metadataFields),
  steps: INSTANCE_RECOVERY_STEPS,
  stepFields: {
    deployment: ['deploymentZoneId'],
    details: ['name', 'description', 'customerId', 'slug', 'lifecycleStage'],
    license: ['licenseSlug', 'licenseDate'],
    metadata: ['metadata'],
  },
  schema: instanceFormSchema,
  fieldLabels: {
    customerId: { key: `${FORM}.Labels.customerId` },
    deploymentZoneId: { key: `${FORM}.Labels.deploymentZoneId` },
    description: { key: `${FORM}.Labels.description` },
    licenseDate: { key: `${FORM}.Labels.licenseDate` },
    licenseSlug: { key: `${FORM}.Labels.licenseId` },
    lifecycleStage: {
      key: 'Pages.Customers.Instances.Detail.lifecycleStageEditor.label',
    },
    metadata: { key: `${FORM}.Steps.metadata` },
    name: { key: `${FORM}.Labels.name` },
    slug: { key: `${FORM}.Labels.slug` },
  },
});
