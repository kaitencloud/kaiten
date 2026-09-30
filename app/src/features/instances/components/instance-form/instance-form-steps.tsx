import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Customer, DeploymentZone, Instance, License } from '@/api-client';
import type { MetadataFieldDescriptor } from '@/functionals/metadata-fields';
import { StackedFormDialogCard } from '@/functionals/stacked-form-dialog';
import {
  type StepStackChildProps,
  StepStackContainer,
  StepStackStep,
} from '@/functionals/step-stack';
import {
  InstanceDeploymentStepFooter,
  InstanceDetailsStepFooter,
  InstanceLicenseStepFooter,
  InstanceMetadataStepFooter,
} from './instance-form-footers';
import {
  InstanceDeploymentFields,
  InstanceInformationFields,
  InstanceLicenseFields,
  InstanceMetadataFields,
} from './instance-form-sections';

type InstanceFormStepsProps = {
  customers: Array<Pick<Customer, 'id' | 'name'>>;
  deploymentZones: DeploymentZone[];
  form: any;
  formId: string;
  instance?: Instance;
  licenses: License[];
  lockedCustomer?: unknown;
  metadataFields: MetadataFieldDescriptor[];
};

const StepHeading = ({ children }: { children: string }) => (
  <h3 className="font-semibold text-xl">{children}</h3>
);

/**
 * The step list, built as an array rather than as conditional JSX:
 * `StepStackContainer` counts its children to size the stack and clones each
 * one to hand it its index, so a `null` in the middle would both inflate the
 * count and crash the clone.
 */
export const InstanceFormSteps = ({
  customers,
  deploymentZones,
  form,
  formId,
  instance,
  licenses,
  lockedCustomer,
  metadataFields,
}: InstanceFormStepsProps) => {
  const { t } = useTranslation();
  // An organization that declares no instance MetadataField gets one step
  // fewer, and the deployment step carries the submit button instead.
  const hasMetadataStep = metadataFields.length > 0;

  const steps: ReactElement<StepStackChildProps>[] = [
    <StepStackStep key="details">
      <StackedFormDialogCard
        loadingFields={3}
        footer={<InstanceDetailsStepFooter form={form} />}
      >
        <div className="space-y-6">
          <StepHeading>
            {t(
              'Pages.Customers.Instances.Mutation.Form.Steps.instanceInformations',
            )}
          </StepHeading>

          <InstanceInformationFields
            canClearLifecycleStage={!instance}
            customerFieldDisabled={!!lockedCustomer}
            form={form}
            customers={customers}
            showSlug={!instance}
          />
        </div>
      </StackedFormDialogCard>
    </StepStackStep>,

    <StepStackStep key="license">
      <StackedFormDialogCard
        loadingFields={2}
        footer={<InstanceLicenseStepFooter form={form} />}
      >
        <div className="space-y-6">
          <StepHeading>
            {t('Pages.Customers.Instances.Mutation.Form.Steps.chooseLicense')}
          </StepHeading>

          <InstanceLicenseFields
            currentLicenseSlug={instance?.licenseSlug}
            form={form}
            licenses={licenses}
          />
        </div>
      </StackedFormDialogCard>
    </StepStackStep>,

    <StepStackStep key="deployment">
      <StackedFormDialogCard
        loadingFields={1}
        footer={
          <InstanceDeploymentStepFooter
            form={form}
            formId={formId}
            hasMetadataStep={hasMetadataStep}
            instance={instance}
          />
        }
      >
        <div className="space-y-6">
          <StepHeading>
            {t('Pages.Customers.Instances.Mutation.Form.Steps.deployment')}
          </StepHeading>

          <InstanceDeploymentFields
            canClearDeploymentZone={!instance?.deploymentZoneId}
            deploymentZones={deploymentZones}
            form={form}
          />
        </div>
      </StackedFormDialogCard>
    </StepStackStep>,
  ];

  if (hasMetadataStep) {
    steps.push(
      <StepStackStep key="metadata">
        <StackedFormDialogCard
          loadingFields={metadataFields.length}
          footer={
            <InstanceMetadataStepFooter
              form={form}
              formId={formId}
              instance={instance}
            />
          }
        >
          <div className="space-y-6">
            <StepHeading>
              {t('Pages.Customers.Instances.Mutation.Form.Steps.metadata')}
            </StepHeading>

            <InstanceMetadataFields
              form={form}
              metadataFields={metadataFields}
            />
          </div>
        </StackedFormDialogCard>
      </StepStackStep>,
    );
  }

  return (
    <StepStackContainer className="justify-start">{steps}</StepStackContainer>
  );
};
