import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StartedSubscription } from '@/api-client';
import { DialogFormSkeleton } from '@/components/dialog/dialog-form-skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RetryableProblem } from '@/domains/billing';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { subscribablePricesQueryOptions } from '../../../../../queries';
import {
  getBasePriceOptions,
  getSubscribeBlock,
} from '../../../../../utils/subscribe-instance.utils';
import { useInstanceDetail } from '../../../instance-detail-context';
import { SubscribeInstanceForm } from './subscribe-instance-form';
import { SubscribedState } from './subscribed-state';

type SubscribeInstanceDialogProps = {
  /** Called when the dialog is closed: the route leads back to the tab. */
  onClose: () => void;
};

function Unavailable({
  children,
  onClose,
}: {
  children: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <StackedFormDialogFooter>
        <Button onClick={onClose} type="button" variant="outline">
          {t('Common.close')}
        </Button>
      </StackedFormDialogFooter>
      <StackedFormDialogPanel>
        <Alert data-testid="subscribe-unavailable">
          <AlertDescription>{children}</AlertDescription>
        </Alert>
      </StackedFormDialogPanel>
    </>
  );
}

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
      <Unavailable onClose={onClose}>
        {t(
          'Pages.Customers.Instances.Detail.Billing.Subscribe.licenseNotPublishedDialog',
          { name: license?.name, version: license?.version },
        )}
      </Unavailable>
    );
  }
  if (prices.isPending) {
    return <DialogFormSkeleton fields={3} />;
  }
  if (prices.isError) {
    return (
      <>
        <StackedFormDialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t('Common.close')}
          </Button>
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <RetryableProblem
            error={prices.error}
            onRetry={() => void prices.refetch()}
          />
        </StackedFormDialogPanel>
      </>
    );
  }
  const options = getBasePriceOptions(prices.data);
  if (options.length === 0) {
    return (
      <Unavailable onClose={onClose}>
        {t('Pages.Customers.Instances.Detail.Billing.Subscribe.noBasePrice', {
          name: license?.name,
          version: license?.version,
        })}
      </Unavailable>
    );
  }

  return (
    <SubscribeInstanceForm
      customer={customer}
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
