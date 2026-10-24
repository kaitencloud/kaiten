import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Customer, DeploymentZone, Instance, License } from '@/api-client';
import { metadataFieldsActiveQueryOptions } from '@/domains/metadata-fields';
import {
  allCustomersOptions,
  allDeploymentZonesOptions,
  allLicensesOptions,
} from '@/lib/api/all-pages-query-options';
import type { MetadataFieldDescriptor } from '@/functionals/metadata-fields';
import { StackedFormDialogDirtyState } from '@/functionals/stacked-form-dialog';
import { StepStack, type StepStackOrientation } from '@/functionals/step-stack';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { setProblemFieldError } from '@/domains/billing';
import { getApiErrorMessage } from '@/lib/errors';
import {
  FROZEN_FIELD_STEPS,
  getChangedFrozenFields,
  INSTANCE_FROZEN_CODE,
  readFrozenRefusal,
} from '../../utils/instance-frozen.utils';
import {
  initialInstanceFormValues,
  instanceFormSchema,
  instanceFormValuesToInstanceInput,
  instanceFormValuesToUpdateInput,
  instanceLifecycleStageToPatchBody,
  instanceToFormValues,
  type InstanceFormValues,
} from '../../utils/instance-form.shared';
import type { InstanceFormStepsHandle } from './instance-form-frozen-notice';
import { InstanceFormSteps } from './instance-form-steps';
import { useInstanceFormMutations } from './use-instance-form-mutations';

export type LockedCustomer = Pick<Customer, 'id' | 'name'>;
type InstanceCustomerOption = Pick<Customer, 'id' | 'name'>;

type InstanceFormProps = {
  instance?: Instance;
  lockedCustomer?: LockedCustomer;
  onSuccess?: (instance: Instance) => void;
  stackOrientation?: StepStackOrientation;
};

type InstanceFormContentProps = InstanceFormProps & {
  customers: InstanceCustomerOption[];
  deploymentZones: DeploymentZone[];
  licenses: License[];
};

const getDefaultValues = (
  instance?: Instance,
  lockedCustomer?: LockedCustomer,
) => {
  if (instance) {
    return instanceToFormValues(instance);
  }

  return lockedCustomer
    ? {
        ...initialInstanceFormValues,
        customerId: lockedCustomer.id,
      }
    : initialInstanceFormValues;
};

const InstanceFormContent = ({
  instance,
  lockedCustomer,
  customers,
  deploymentZones,
  licenses,
  onSuccess,
  stackOrientation = 'top',
}: InstanceFormContentProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const formId = useId();

  // Soft-fetch, as on the instances table: a missing or 403'd response reads as
  // "no schema declared", and the form simply has one step fewer.
  const { data: metadataFieldsData } = useQuery(
    metadataFieldsActiveQueryOptions('INSTANCE'),
  );
  const metadataFields = useMemo<MetadataFieldDescriptor[]>(
    () => metadataFieldsData ?? [],
    [metadataFieldsData],
  );

  const { createMutation, lifecycleMutation, updateMutation } =
    useInstanceFormMutations(instance);
  // The submit is on the last step, and a refusal about a field on an earlier
  // one has to take the person there.
  const stepsRef = useRef<InstanceFormStepsHandle>(null);
  // The instance and the form as they were when the form opened: an update sends
  // the fields that differ from them, and takes the others from the instance as
  // the API holds it.
  const [openedInstance] = useState(instance);
  const [openedValues] = useState(() =>
    getDefaultValues(instance, lockedCustomer),
  );

  const form = useAppForm({
    defaultValues: openedValues,
    validators: {
      onChange: instanceFormSchema,
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        const nextLifecycleStage = (value.lifecycleStage ?? '').trim();

        let savedInstance: Instance;

        if (instance) {
          // An update may answer with no body; the instance being edited then
          // stands in, since only its slug is needed downstream.
          const base = openedInstance ?? instance;
          savedInstance =
            (await updateMutation.mutateAsync({
              edited: instanceFormValuesToUpdateInput(
                value,
                licenses ?? [],
                base,
              ),
              instanceSlug: instance.slug!,
              opened: instanceFormValuesToUpdateInput(
                openedValues as InstanceFormValues,
                licenses ?? [],
                base,
              ),
            })) ?? instance;

          // Only a non-empty, changed stage is persisted: PATCH rejects an
          // empty one and reads an omitted one as "keep the current", so an
          // emptied field means "leave it alone" rather than a 422.
          if (
            nextLifecycleStage &&
            nextLifecycleStage !== (instance.lifecycleStage ?? '')
          ) {
            await lifecycleMutation.mutateAsync({
              path: { instanceSlug: instance.slug! },
              body: instanceLifecycleStageToPatchBody(nextLifecycleStage),
            });
          }
        } else {
          savedInstance = await createMutation.mutateAsync({
            body: instanceFormValuesToInstanceInput(value, licenses ?? []),
          });

          if (nextLifecycleStage && savedInstance?.slug) {
            await lifecycleMutation.mutateAsync({
              path: { instanceSlug: savedInstance.slug },
              body: instanceLifecycleStageToPatchBody(nextLifecycleStage),
            });
          }
        }

        // Once everything is saved, lifecycle stage included.
        toast.success(
          t(
            instance
              ? 'Pages.Customers.Instances.Mutation.Form.updateSuccess'
              : 'Pages.Customers.Instances.Mutation.Form.createSuccess',
          ),
        );

        if (onSuccess) {
          onSuccess(savedInstance);
        } else {
          router.navigate({ to: '/customers/instances' });
        }
      } catch (e) {
        // While the subscription of the instance lives, its customer and license
        // are frozen: the refusal goes on the field that was changed, with the way
        // to the subscription, and the person is taken to its step. It keeps the
        // toast when no frozen field was changed, since there is none to mark.
        const frozen = instance ? readFrozenRefusal(e) : undefined;
        const fields =
          instance && frozen ? getChangedFrozenFields(value, instance) : [];
        if (frozen && fields.length > 0) {
          for (const field of fields) {
            setProblemFieldError(formApi, field, frozen.detail, {
              code: INSTANCE_FROZEN_CODE,
            });
          }
          stepsRef.current?.goToStep(FROZEN_FIELD_STEPS[fields[0]]);

          return;
        }
        toast.error(getApiErrorMessage(e));
      }
    },
  });

  return (
    <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <form.Subscribe selector={(state) => state.isDefaultValue}>
          {(isDefaultValue) => (
            <StackedFormDialogDirtyState dirty={!isDefaultValue} />
          )}
        </form.Subscribe>
        <StepStack embedded orientation={stackOrientation}>
          <InstanceFormSteps
            customers={customers}
            deploymentZones={deploymentZones}
            form={form}
            formId={formId}
            instance={instance}
            licenses={licenses}
            lockedCustomer={lockedCustomer}
            metadataFields={metadataFields}
            stepsRef={stepsRef}
          />
        </StepStack>
      </form.AppForm>
    </form>
  );
};

const LockedCustomerInstanceForm = (props: InstanceFormProps) => {
  const { data: licenses } = useSuspenseQuery(allLicensesOptions());
  const { data: deploymentZones } = useSuspenseQuery(
    allDeploymentZonesOptions(),
  );

  return (
    <InstanceFormContent
      {...props}
      customers={props.lockedCustomer ? [props.lockedCustomer] : []}
      deploymentZones={deploymentZones?.items ?? []}
      licenses={licenses?.items ?? []}
    />
  );
};

const UnlockedCustomerInstanceForm = (props: InstanceFormProps) => {
  const { data: customers } = useSuspenseQuery(allCustomersOptions());
  const { data: licenses } = useSuspenseQuery(allLicensesOptions());
  const { data: deploymentZones } = useSuspenseQuery(
    allDeploymentZonesOptions(),
  );

  return (
    <InstanceFormContent
      {...props}
      customers={customers?.items ?? []}
      deploymentZones={deploymentZones?.items ?? []}
      licenses={licenses?.items ?? []}
    />
  );
};

export const InstanceForm = (props: InstanceFormProps) => {
  return props.lockedCustomer ? (
    <LockedCustomerInstanceForm {...props} />
  ) : (
    <UnlockedCustomerInstanceForm {...props} />
  );
};
