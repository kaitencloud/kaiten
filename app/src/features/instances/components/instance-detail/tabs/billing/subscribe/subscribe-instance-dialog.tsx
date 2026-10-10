import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StartedSubscription } from '@/api-client';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { subscribablePricesQueryOptions } from '../../../../../queries';
import {
  getBasePriceOptions,
  getSubscribeBlock,
} from '../../../../../utils/subscribe-instance.utils';
import { useInstanceDetail } from '../../../instance-detail-context';
import { DialogLoading, DialogNotice, DialogProblem } from '../dialog-states';
import { SubscribeInstanceForm } from './subscribe-instance-form';
import { SubscribedState } from './subscribed-state';

type SubscribeInstanceDialogProps = {
  /** Called when the dialog is closed: the route leads back to the tab. */
  onClose: () => void;
};

const UNAVAILABLE_TEST_ID = 'subscribe-unavailable';

function SubscribeContent({
  onClose,
  onSubscribed,
}: {
  onClose: () => void;
  onSubscribed: (started: StartedSubscription) => void;
}) {
  const { t } = useTranslation();
  const { customer, instance, license } = useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const prices = useQuery({
    ...subscribablePricesQueryOptions(instance.licenseSlug),
    enabled: !getSubscribeBlock(license),
  });

  if (getSubscribeBlock(license)) {
    return (
      <DialogNotice onClose={onClose} testId={UNAVAILABLE_TEST_ID}>
        {t(
          'Pages.Customers.Instances.Detail.Billing.Subscribe.licenseNotPublishedDialog',
          { name: license?.name, version: license?.version },
        )}
      </DialogNotice>
    );
  }
  if (prices.isPending) {
    return <DialogLoading />;
  }
  if (prices.isError) {
    return (
      <DialogProblem
        error={prices.error}
        onClose={onClose}
        onRetry={() => void prices.refetch()}
      />
    );
  }
  const options = getBasePriceOptions(prices.data);
  if (options.length === 0) {
    return (
      <DialogNotice onClose={onClose} testId={UNAVAILABLE_TEST_ID}>
        {t('Pages.Customers.Instances.Detail.Billing.Subscribe.noBasePrice', {
          name: license?.name,
          version: license?.version,
        })}
      </DialogNotice>
    );
  }

  return (
    <SubscribeInstanceForm
      customer={customer}
      defaultTrialDays={license?.trialPeriodDays ?? 0}
      familyId={license?.familyId}
      instanceSlug={instanceSlug}
      onCancel={onClose}
      onSubscribed={onSubscribed}
      prices={options}
    />
  );
}

/**
 * The dialog that subscribes an instance, a route of its own over the Billing tab
 * (`/billing/subscribe`): closing it leads back to the tab, and a link to it
 * opens it. Once the subscription has started it says so, with the way to the
 * invoice of the first period, and stays until it is closed; until then a
 * refusal leaves it open with what was typed.
 */
export function SubscribeInstanceDialog({
  onClose,
}: SubscribeInstanceDialogProps) {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();
  const [started, setStarted] = useState<StartedSubscription | null>(null);

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t(
        'Pages.Customers.Instances.Detail.Billing.Subscribe.description',
      )}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={t(
        'Pages.Customers.Instances.Detail.Billing.Subscribe.dialogTitle',
        {
          name: instance.name,
        },
      )}
    >
      {started ? (
        <SubscribedState onClose={onClose} started={started} />
      ) : (
        <SubscribeContent onClose={onClose} onSubscribed={setStarted} />
      )}
    </StackedFormDialog>
  );
}
