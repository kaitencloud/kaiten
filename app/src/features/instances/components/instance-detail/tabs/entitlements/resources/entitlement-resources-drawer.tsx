import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { isUnlimitedThreshold } from '@/domains/entitlement-usage';
import type { ResourceLimit } from './entitlement-resources-columns';
import { EntitlementResourcesList } from './entitlement-resources-list';

type EntitlementResourcesDrawerProps = {
  /** Whether the session may read the usage history, which each resource links to. */
  canViewHistory: boolean;
  entitlementName: string;
  entitlementSlug: string;
  instanceName: string;
  instanceSlug: string;
  /** What every resource is measured against: the limit of the entitlement on the instance. */
  limit: ResourceLimit;
  locale: string;
  /** Closes the drawer: the route drops the entitlement it was opened on. */
  onClose: () => void;
};

/**
 * The resources of an entitlement that counts per resource, the drawer the URL opens
 * (`?resources=<entitlementSlug>`) over the entitlements tab: one counter for each
 * resource of the instance, each against the one limit of the entitlement, in the order of
 * their keys, a page at a time. The entitlement's own row shows the highest of them; this is
 * the detail. It only reads: a resource is created by its first accepted report and forgotten
 * by the vendor's product, which is the one that knows when the object it stands for is gone.
 */
export function EntitlementResourcesDrawer({
  entitlementName,
  instanceName,
  limit,
  locale,
  onClose,
  ...list
}: EntitlementResourcesDrawerProps) {
  const { t } = useTranslation();
  const limitLabel =
    limit.threshold === null
      ? '-'
      : isUnlimitedThreshold(limit.threshold)
        ? t('Pages.Customers.Instances.Detail.entitlements.unlimited')
        : limit.threshold.toLocaleString(locale);

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent
        className="w-full gap-0 sm:max-w-3xl"
        data-testid="entitlement-resources"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>
            {t('Pages.Customers.Instances.Detail.entitlements.resources.title')}
          </SheetTitle>
          <SheetDescription>
            {t(
              'Pages.Customers.Instances.Detail.entitlements.resources.description',
              {
                entitlement: entitlementName,
                instance: instanceName,
                limit: limitLabel,
              },
            )}
          </SheetDescription>
        </SheetHeader>
        {/* A native container and not a ScrollArea: that lets its content grow to
            its natural width, and the table must scroll inside its own container on a phone. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <section
            aria-label={t(
              'Pages.Customers.Instances.Detail.entitlements.resources.region',
              { entitlement: entitlementName },
            )}
          >
            <EntitlementResourcesList
              {...list}
              entitlementName={entitlementName}
              limit={limit}
              locale={locale}
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
