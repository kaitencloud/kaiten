import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { isSubscriptionLive } from '@/domains/billing';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { useAttachableAddons } from '../../../../../hooks/use-attachable-addons';
import {
  instanceAddonsQueryOptions,
  instanceBillingQueryOptions,
} from '../../../../../queries';
import { useInstanceDetail } from '../../../instance-detail-context';
import { DialogLoading, DialogNotice, DialogProblem } from '../dialog-states';
import { AddonsReadNotice } from './addons-read-notice';
import { AttachAddonForm } from './attach-addon-form';

type AttachAddonDialogProps = {
  /** Called when the dialog is closed: the route leads back to the tab. */
  onClose: () => void;
};

const UNAVAILABLE_TEST_ID = 'attach-addon-unavailable';

function AttachAddonContent({ onClose }: AttachAddonDialogProps) {
  const { t } = useTranslation();
  const { instance, license } = useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const billing = useQuery(instanceBillingQueryOptions(instanceSlug));
  const held = useQuery(instanceAddonsQueryOptions(instanceSlug));
  const subscription = billing.data;
  const live = isSubscriptionLive(subscription);
  const attachable = useAttachableAddons({
    enabled: live && held.isSuccess,
    familyId: license?.familyId,
    held: held.data?.items ?? [],
  });

  // A version that could not be checked is left out and the others are offered; it is
  // a failure of the whole only when nothing else is left to offer.
  const failed =
    billing.error ??
    held.error ??
    attachable.error ??
    (attachable.items.length === 0 ? attachable.unreadError : null);
  if (failed) {
    return (
      <DialogProblem
        error={failed}
        onClose={onClose}
        onRetry={() => {
          if (billing.isError) {
            void billing.refetch();
          }
          if (held.isError) {
            void held.refetch();
          }
          attachable.refetch();
        }}
      />
    );
  }
  if (billing.isPending || held.isPending) {
    return <DialogLoading fields={2} />;
  }
  if (!subscription || !live) {
    return (
      <DialogNotice onClose={onClose} testId={UNAVAILABLE_TEST_ID}>
        {t('Pages.Customers.Instances.Detail.Billing.Addons.Attach.notLive')}
      </DialogNotice>
    );
  }
  if (attachable.isPending) {
    return <DialogLoading fields={2} />;
  }
  if (attachable.items.length === 0) {
    return (
      <DialogNotice onClose={onClose} testId={UNAVAILABLE_TEST_ID}>
        {t('Pages.Customers.Instances.Detail.Billing.Addons.Attach.none')}
      </DialogNotice>
    );
  }

  return (
    <AttachAddonForm
      addons={attachable.items}
      notice={
        attachable.unreadError ? (
          <AddonsReadNotice
            error={attachable.unreadError}
            onRetry={attachable.refetch}
            partial
          />
        ) : null
      }
      onAttached={onClose}
      onCancel={onClose}
      subscription={subscription}
    />
  );
}

/**
 * The dialog that attaches an add-on to an instance, a route of its own over the
 * Billing tab (`/billing/attach-addon`): closing it leads back to the tab, and a
 * link to it opens it. It offers the versions on sale that fit the instance, only
 * while its subscription is live; otherwise it says why there is nothing to do.
 */
export function AttachAddonDialog({ onClose }: AttachAddonDialogProps) {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t(
        'Pages.Customers.Instances.Detail.Billing.Addons.Attach.description',
      )}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={t(
        'Pages.Customers.Instances.Detail.Billing.Addons.Attach.dialogTitle',
        { name: instance.name },
      )}
    >
      <AttachAddonContent onClose={onClose} />
    </StackedFormDialog>
  );
}
