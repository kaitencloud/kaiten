import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import { Button } from '@/components/ui/button';
import { useCanPerform } from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import { getSubscribeBlock } from '../../../../utils/subscribe-instance.utils';

const SubscriptionIcon = dataModelIcons.subscription;

// The words the license page uses for the state of a version.
const LICENSE_STATE_KEYS = {
  ARCHIVED: 'Pages.Licenses.Lifecycle.ARCHIVED',
  DRAFT: 'Pages.Licenses.Lifecycle.DRAFT',
  PUBLISHED: 'Pages.Licenses.Lifecycle.PUBLISHED',
} as const satisfies Record<NonNullable<License['lifecycleState']>, string>;

type SubscribeActionProps = {
  instanceSlug: string;
  /** The license version of the instance, whose state decides whether it can be subscribed to. */
  license: License | null;
};

/**
 * The way to subscribe an instance: a link to the dialog, offered to a session
 * that may write billing. An instance on a version that is not on sale cannot be
 * subscribed, and the button says why instead of opening a dialog that would
 * only be refused: it stays in the tab order and the reason is the text it is
 * described by.
 */
export function SubscribeAction({
  instanceSlug,
  license,
}: SubscribeActionProps) {
  const { t } = useTranslation();
  const reasonId = useId();
  const maySubscribe = useCanPerform('subscription.subscribe');
  const block = getSubscribeBlock(license);

  if (!maySubscribe) {
    return null;
  }

  if (block) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Button
          aria-describedby={reasonId}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          disabled
          focusableWhenDisabled
          type="button"
        >
          <SubscriptionIcon className="size-4" />
          {t('Pages.Customers.Instances.Detail.Billing.Subscribe.open')}
        </Button>
        <p
          className="max-w-md text-xs text-muted-foreground"
          id={reasonId}
          data-testid="subscribe-unavailable"
        >
          {t(
            'Pages.Customers.Instances.Detail.Billing.Subscribe.licenseNotPublished',
            {
              name: license?.name,
              state: t(
                LICENSE_STATE_KEYS[license?.lifecycleState ?? 'PUBLISHED'],
              ),
              version: license?.version,
            },
          )}
        </p>
      </div>
    );
  }

  return (
    <Button
      nativeButton={false}
      render={
        <Link
          params={{ instanceSlug }}
          to="/customers/instances/$instanceSlug/billing/subscribe"
        >
          <SubscriptionIcon className="size-4" />
          {t('Pages.Customers.Instances.Detail.Billing.Subscribe.open')}
        </Link>
      }
      role="link"
    />
  );
}
