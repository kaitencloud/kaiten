import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Instance } from '@/api-client';
import { useActionAccess, useLeaveRestrictedDialog } from '@/domains/billing';
import {
  FormRecoveryAnnouncer,
  useFormRecovery,
} from '@/functionals/form-recovery';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { metadataFieldsActiveQueryOptions } from '@/domains/metadata-fields';
import {
  allCustomersOptions,
  allDeploymentZonesOptions,
  allLicensesOptions,
} from '@/lib/api/all-pages-query-options';
import {
  getInstanceFormDefaults,
  InstanceForm,
  type LockedCustomer,
} from './instance-form';
import {
  INSTANCE_RECOVERY_STEP_LABEL_KEYS,
  instanceRecovery,
} from './instance-recovery';

type InstanceFormDialogProps = {
  instance?: Instance;
  lockedCustomer?: LockedCustomer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (instance: Instance) => void;
};

export function InstanceFormDialog({
  instance,
  lockedCustomer,
  open,
  onOpenChange,
  onSuccess,
}: InstanceFormDialogProps) {
  const access = useActionAccess(
    instance ? 'instance.update' : 'instances.create',
  );

  // The addresses of the forms are opened by hand as well as from their buttons: a session
  // that may not write instances is not given a form that ends in a refusal.
  useLeaveRestrictedDialog(access, () => onOpenChange(false), open);
  if (!access.allowed) {
    return null;
  }

  return (
    <InstanceFormDialogContent
      instance={instance}
      lockedCustomer={lockedCustomer}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      open={open}
    />
  );
}

/**
 * The dialog of a session that may write instances. What a creation typed and did not
 * send is offered back on the next visit, for the same customer when the dialog was
 * opened for one; the edit keeps nothing. The door freezes at its mount whether it is
 * on, so it is opened once the access is known, and the dialog opens once the device
 * was read, so that its first focus lands on the offer when there is one. Confirming
 * that the changes are to be discarded drops the input; leaving by a link keeps it.
 */
function InstanceFormDialogContent({
  instance,
  lockedCustomer,
  open,
  onOpenChange,
  onSuccess,
}: InstanceFormDialogProps) {
  const { t } = useTranslation();
  const recovery = useFormRecovery(instanceRecovery, {
    context: lockedCustomer ? `customer:${lockedCustomer.id}` : '',
    enabled: !instance,
    pristine: getInstanceFormDefaults(undefined, lockedCustomer),
  });
  // With an offer, the dialog also waits for what the form reads, so that the Resume
  // button is drawn when the dialog takes its first focus, and a resume lands on the
  // metadata step when that is where the person was.
  const customers = useQuery({
    ...allCustomersOptions(),
    enabled: Boolean(recovery.offer) && !lockedCustomer,
  });
  const licenses = useQuery({
    ...allLicensesOptions(),
    enabled: Boolean(recovery.offer),
  });
  const zones = useQuery({
    ...allDeploymentZonesOptions(),
    enabled: Boolean(recovery.offer),
  });
  const metadataFields = useQuery({
    ...metadataFieldsActiveQueryOptions('INSTANCE'),
    enabled: Boolean(recovery.offer),
  });
  const formDataPending =
    (!lockedCustomer && customers.isLoading) ||
    licenses.isLoading ||
    zones.isLoading ||
    metadataFields.isLoading;
  if (
    recovery.writer.status === 'reading' ||
    (recovery.offer && formDataPending)
  ) {
    return null;
  }

  return (
    <StackedFormDialog
      initialFocus={recovery.offer ? recovery.focusOffer : undefined}
      onDiscard={instance ? undefined : () => recovery.discard()}
      stacked
      loadingFields={3}
      className="max-w-[min(96vw,1400px)]"
      open={open}
      onOpenChange={onOpenChange}
      title={
        instance
          ? t('Pages.Customers.Instances.Mutation.titleUpdate')
          : t('Pages.Customers.Instances.Mutation.titleNew')
      }
    >
      <FormRecoveryAnnouncer
        recovery={recovery}
        stepLabels={INSTANCE_RECOVERY_STEP_LABEL_KEYS.map((key) => t(key))}
      />
      <InstanceForm
        key={recovery.sessionKey}
        instance={instance}
        recovery={recovery}
        lockedCustomer={lockedCustomer}
        onSuccess={onSuccess ?? (() => onOpenChange(false))}
        stackOrientation="bottom-right"
      />
    </StackedFormDialog>
  );
}
