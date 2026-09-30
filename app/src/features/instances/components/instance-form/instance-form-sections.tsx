import { Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Customer, DeploymentZone, License } from '@/api-client';
import {
  buildFormFieldsFromSchema,
  DynamicForm,
  type DynamicFormValue,
  type MetadataFieldDescriptor,
  partitionMetadata,
  validateDynamicForm,
} from '@/functionals/metadata-fields';
import { generateSlug } from '@/functionals/slug';
import {
  getLifecycleStageLabel,
  LIFECYCLE_STAGE_DEFAULTS,
} from '@/domains/customer-management';
import {
  formatLicenseOptionLabel,
  getAssignableLicenses,
} from '../../utils/instance-license-options.utils';

type InstanceInformationFieldsProps = {
  // The lifecycle stage can only be taken back to none before the instance
  // exists. PATCH /instances rejects an empty stage (minLength 1) and treats an
  // omitted one as "keep the current" — clearing back to unset is deliberately
  // unsupported — so on an existing instance the entry would offer a
  // state the API refuses.
  canClearLifecycleStage?: boolean;
  customerFieldDisabled?: boolean;
  form: any;
  customers: Array<Pick<Customer, 'id' | 'name'>>;
  // The slug is only editable on the creation form — the update body does not
  // accept it. Hidden by default so the shared detail card stays unchanged.
  showSlug?: boolean;
};

export const InstanceInformationFields = ({
  canClearLifecycleStage = false,
  customerFieldDisabled = false,
  form,
  customers,
  showSlug = false,
}: InstanceInformationFieldsProps) => {
  const { t } = useTranslation();

  return (
    <Suspense fallback={null}>
      <form.AppField name="name">
        {(field: any) => (
          <field.TextField
            label={t('Pages.Customers.Instances.Mutation.Form.Labels.name')}
            required
            placeholder={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.name',
            )}
            description={t(
              'Pages.Customers.Instances.Mutation.Form.Descriptions.name',
            )}
            onChange={
              showSlug
                ? (value: string) =>
                    form.setFieldValue('slug', generateSlug(value))
                : undefined
            }
          />
        )}
      </form.AppField>

      {showSlug ? (
        <form.AppField name="slug">
          {(field: any) => (
            <field.TextField
              label={t('Pages.Customers.Instances.Mutation.Form.Labels.slug')}
              placeholder={t(
                'Pages.Customers.Instances.Mutation.Form.Placeholders.slug',
              )}
              description={t(
                'Pages.Customers.Instances.Mutation.Form.Descriptions.slug',
              )}
            />
          )}
        </form.AppField>
      ) : null}
      <form.AppField name="description">
        {(field: any) => (
          <field.TextAreaField
            label={t(
              'Pages.Customers.Instances.Mutation.Form.Labels.description',
            )}
            placeholder={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.description',
            )}
          />
        )}
      </form.AppField>
      <form.AppField name="customerId">
        {(field: any) => (
          <field.ComboboxField
            label={t(
              'Pages.Customers.Instances.Mutation.Form.Labels.customerId',
            )}
            required
            disabled={customerFieldDisabled}
            placeholder={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.customerId',
            )}
            description={t(
              'Pages.Customers.Instances.Mutation.Form.Descriptions.customerId',
            )}
            searchPlaceholder={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.customerIdSearch',
            )}
            getOptionLabel={(customer: Customer) => customer.name}
            getOptionValue={(customer: Customer) => customer.id}
            options={customers}
          />
        )}
      </form.AppField>
      <form.AppField name="lifecycleStage">
        {(field: any) => (
          <field.ComboboxField
            allowCustomValue
            clearable={canClearLifecycleStage}
            clearLabel={t(
              'Pages.Customers.Instances.Detail.lifecycleStageEditor.none',
            )}
            label={t(
              'Pages.Customers.Instances.Detail.lifecycleStageEditor.label',
            )}
            options={[...LIFECYCLE_STAGE_DEFAULTS]}
            placeholder={t(
              'Pages.Customers.Instances.Detail.lifecycleStageEditor.placeholder',
              'Select or type a stage',
            )}
            searchPlaceholder={t(
              'Pages.Customers.Instances.Detail.lifecycleStageEditor.searchPlaceholder',
              'Search or create a stage',
            )}
            getOptionLabel={(stage: string) => getLifecycleStageLabel(t, stage)}
            getOptionValue={(stage: string) => stage}
          />
        )}
      </form.AppField>
    </Suspense>
  );
};

type InstanceLicenseFieldsProps = {
  // The instance's own license, kept in the list even once archived: an
  // instance stays on its version after the version is withdrawn from sale.
  currentLicenseSlug?: string;
  form: any;
  licenses: License[];
};

export const InstanceLicenseFields = ({
  currentLicenseSlug,
  form,
  licenses,
}: InstanceLicenseFieldsProps) => {
  const { t } = useTranslation();
  const assignableLicenses = getAssignableLicenses(
    licenses,
    currentLicenseSlug,
  );

  return (
    <Suspense fallback={null}>
      <form.AppField name="licenseSlug">
        {(field: any) => (
          <field.SelectField
            label={t(
              'Pages.Customers.Instances.Mutation.Form.Labels.licenseId',
            )}
            required
            placeholder={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.licenseId',
            )}
            description={t(
              'Pages.Customers.Instances.Mutation.Form.Descriptions.licenseId',
            )}
            options={assignableLicenses}
            getOptionLabel={(license: License) =>
              formatLicenseOptionLabel(license, t)
            }
            getOptionValue={(license: License) => license.slug!}
          />
        )}
      </form.AppField>
      <form.AppField name="licenseDate">
        {(field: any) => (
          <field.DateRangePickerField
            label={t(
              'Pages.Customers.Instances.Mutation.Form.Labels.licenseDate',
            )}
            required
            description={t(
              'Pages.Customers.Instances.Mutation.Form.Descriptions.licenseDate',
            )}
          />
        )}
      </form.AppField>
    </Suspense>
  );
};

type InstanceDeploymentFieldsProps = {
  // A zone can only be taken back to none while the instance has none. The PUT
  // reads an omitted deploymentZoneId as "keep the current one", so on a
  // deployed instance the entry would offer a detach the API cannot perform
  // — detaching is not a thing, migrating to another zone is.
  canClearDeploymentZone?: boolean;
  deploymentZones: DeploymentZone[];
  form: any;
};

export const InstanceDeploymentFields = ({
  canClearDeploymentZone = false,
  deploymentZones,
  form,
}: InstanceDeploymentFieldsProps) => {
  const { t } = useTranslation();

  return (
    <Suspense fallback={null}>
      <form.AppField name="deploymentZoneId">
        {(field: any) => (
          <field.ComboboxField
            // The zone is optional: an instance can be created orphan and
            // deployed later, so picking one must stay undoable.
            clearable={canClearDeploymentZone}
            clearLabel={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.noDeploymentZone',
            )}
            label={t(
              'Pages.Customers.Instances.Mutation.Form.Labels.deploymentZoneId',
            )}
            placeholder={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.deploymentZoneId',
            )}
            description={t(
              'Pages.Customers.Instances.Mutation.Form.Descriptions.deploymentZoneId',
            )}
            searchPlaceholder={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.deploymentZoneIdSearch',
            )}
            getOptionLabel={(zone: DeploymentZone) =>
              zone.type ? `${zone.name} — ${zone.type}` : zone.name
            }
            getOptionValue={(zone: DeploymentZone) => zone.id}
            options={deploymentZones}
          />
        )}
      </form.AppField>
    </Suspense>
  );
};

type InstanceMetadataFieldsProps = {
  form: any;
  metadataFields: MetadataFieldDescriptor[];
};

/**
 * One input per active MetadataField, typed from its JSON Schema.
 *
 * Instance metadata is tolerant: the SaaS auto-reports keys no field declares,
 * and archived fields leave values behind. Neither is editable here, but both
 * are folded back into the form value on every change -- the PUT full-replaces
 * metadata, so a key this form dropped would be a key the instance loses.
 */
export const InstanceMetadataFields = ({
  form,
  metadataFields,
}: InstanceMetadataFieldsProps) => {
  const formFields = useMemo(
    () => buildFormFieldsFromSchema(metadataFields),
    [metadataFields],
  );

  return (
    <Suspense fallback={null}>
      <form.AppField name="metadata">
        {(field: any) => {
          const value = (field.state.value ?? {}) as DynamicFormValue;
          const { knownActive, archivedLeftovers, unknown } = partitionMetadata(
            value,
            metadataFields,
          );
          const preserved = { ...archivedLeftovers, ...unknown };

          return (
            <DynamicForm
              fields={formFields}
              value={knownActive}
              onChange={(next) => field.handleChange({ ...preserved, ...next })}
              // Tolerant, like the resource: unknown keys are legitimate here,
              // so only the declared fields' own schemas are enforced.
              errors={validateDynamicForm(formFields, knownActive, 'tolerant')}
            />
          );
        }}
      </form.AppField>
    </Suspense>
  );
};
