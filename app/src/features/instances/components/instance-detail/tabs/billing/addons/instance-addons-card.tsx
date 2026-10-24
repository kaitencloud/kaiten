import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  addonVersionsQueryOptions,
  BoundaryClosingNotice,
  isSubscriptionLive,
  ListEmptyState,
  ProblemAlert,
  RetryableProblem,
  useBillingCapabilities,
  useCanPerform,
} from '@/domains/billing';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useInstanceAddonActions } from '../../../../../hooks/use-instance-addon-actions';
import { instanceAddonsQueryOptions } from '../../../../../queries';
import { joinHeldAddons } from '../../../../../utils/instance-addons.utils';
import { useInstanceDetail } from '../../../instance-detail-context';
import { InstanceAddonActionsProvider } from './instance-addon-actions-context';
import { InstanceAddonsTable } from './instance-addons-table';

const AddonIcon = dataModelIcons.addon;

// Written out in full, so that a key that does not exist fails the check of the keys.
const KEYS = {
  attach: 'Pages.Customers.Instances.Detail.Billing.Addons.attach',
  description: 'Pages.Customers.Instances.Detail.Billing.Addons.description',
  emptyDescription:
    'Pages.Customers.Instances.Detail.Billing.Addons.Empty.description',
  emptyTitle: 'Pages.Customers.Instances.Detail.Billing.Addons.Empty.title',
  loading: 'Pages.Customers.Instances.Detail.Billing.Addons.loading',
  note: 'Pages.Customers.Instances.Detail.Billing.Addons.note',
  notLive: 'Pages.Customers.Instances.Detail.Billing.Addons.notLive',
  title: 'Pages.Customers.Instances.Detail.Billing.Addons.title',
} as const;

type InstanceAddonsCardProps = {
  instanceSlug: string;
  /** The subscription of the instance, or `null` when nobody bills it. */
  subscription: InstanceBilling | null;
};

/**
 * The add-ons an instance holds, on its Billing tab: the quantity of each stepped
 * within what its version allows, the way to take one off, and, while the
 * subscription is live, the way to add another. A change applies to the
 * entitlements at once and is billed from the next renewal; the card says so, and
 * the toast that follows a change says what it did to the effective values.
 *
 * Add-ons are offered only while the subscription is live: an instance nobody bills
 * takes them with its subscription, in the dialog that starts it, where the API
 * checks them as a whole; attached before, nothing checks that they can be billed.
 * One the instance already holds stays listed, and can be stepped or removed
 * whatever the state of the subscription.
 *
 * Where the release has no add-ons, or the session may not read the add-ons of an
 * instance, there is no card; and an instance nobody bills that holds none has
 * nothing to list.
 */
export function InstanceAddonsCard({
  instanceSlug,
  subscription,
}: InstanceAddonsCardProps) {
  const { t } = useTranslation();
  const { entitlements } = useInstanceDetail();
  const featureOn = useBillingCapabilities().has('addons');
  const mayList = useCanPerform('instance.addons.list') && featureOn;
  const mayReadCatalogue = useCanPerform('addons.read');
  const mayAttachToInstance = useCanPerform('instance.addons.attach');
  const mayReadFamilies = useCanPerform('licenseFamilies.list');
  // Which add-ons fit an instance is found by the family of its license, and from
  // the catalogue: the dialog needs both to offer any.
  const mayAttach = mayAttachToInstance && mayReadCatalogue && mayReadFamilies;
  const maySetQuantity = useCanPerform('instance.addons.setQuantity');
  const mayDetach = useCanPerform('instance.addons.detach');
  const held = useQuery({
    ...instanceAddonsQueryOptions(instanceSlug),
    enabled: mayList,
  });
  // The attachments name what is held. The versions add whether one was withdrawn from
  // sale and how a unit with no price is sold, which the attachment does not say.
  const versions = useQuery({
    ...addonVersionsQueryOptions(),
    enabled: mayList && mayReadCatalogue,
  });
  const actions = useInstanceAddonActions(instanceSlug, entitlements);
  const live = isSubscriptionLive(subscription);

  if (!mayList) {
    return null;
  }
  if (held.isPending) {
    return (
      <Skeleton
        aria-busy="true"
        aria-label={t(KEYS.loading)}
        className="h-40 w-full"
        role="status"
      />
    );
  }
  if (held.isError) {
    return (
      <RetryableProblem
        data-testid="instance-addons-error"
        error={held.error}
        onRetry={() => void held.refetch()}
      />
    );
  }
  const rows = joinHeldAddons(held.data.items, versions.data?.items ?? []);
  if (rows.length === 0 && !subscription) {
    return null;
  }

  return (
    <InstanceAddonActionsProvider actions={actions}>
      <div data-testid="instance-addons">
        <TableCard>
          <TableCard.Header>
            <TableCard.HeaderLeading>
              <TableCard.HeaderIcon>
                <AddonIcon />
              </TableCard.HeaderIcon>
              <TableCard.HeaderHeading>
                <TableCard.HeaderTitle>{t(KEYS.title)}</TableCard.HeaderTitle>
                <TableCard.HeaderSubtitle>
                  {t(KEYS.description)}
                </TableCard.HeaderSubtitle>
              </TableCard.HeaderHeading>
            </TableCard.HeaderLeading>
            {live && mayAttach ? (
              <TableCard.HeaderActions>
                <Button
                  nativeButton={false}
                  render={
                    <Link
                      params={{ instanceSlug }}
                      to="/customers/instances/$instanceSlug/billing/attach-addon"
                    >
                      <Plus className="size-4" />
                      {t(KEYS.attach)}
                    </Link>
                  }
                  role="link"
                  size="sm"
                />
              </TableCard.HeaderActions>
            ) : null}
          </TableCard.Header>
          <TableCard.Toolbar className="md:flex-col md:items-stretch">
            {actions.closing ? <BoundaryClosingNotice /> : null}
            {actions.failure && !actions.closing ? (
              <ProblemAlert
                error={actions.failure.error}
                onRetry={() => void actions.retry()}
              />
            ) : null}
            {live ? null : (
              <p
                className="text-sm text-muted-foreground"
                data-testid="addons-not-live"
              >
                {t(KEYS.notLive)}
              </p>
            )}
          </TableCard.Toolbar>
          <TableCard.Content>
            {rows.length === 0 ? (
              <div className="px-6">
                <ListEmptyState
                  description={t(KEYS.emptyDescription)}
                  icon={AddonIcon}
                  testId="instance-addons-empty"
                  title={t(KEYS.emptyTitle)}
                />
              </div>
            ) : (
              <InstanceAddonsTable
                mayDetach={mayDetach}
                maySetQuantity={maySetQuantity}
                rows={rows}
              />
            )}
            <p
              className="px-6 py-4 text-sm text-muted-foreground"
              data-testid="addons-note"
            >
              {t(KEYS.note)}
            </p>
          </TableCard.Content>
        </TableCard>
      </div>
    </InstanceAddonActionsProvider>
  );
}
