import type { BillingAppModel } from './billing-app-model';
import type { InstanceAppModel } from './instance-app-model';
import type { PreviewInstance, PreviewWorld } from './license-invoice-preview';

/**
 * What the preview of a license invoice reads of the rest of the organization, from the
 * slots that are served beside the licenses: the add-ons and the vouchers are billing's,
 * and the instances are known to billing and to the instances, which also hold the journal
 * of their usage. A slot that is not served leaves what it holds unknown, as an organization
 * that has none would.
 */
export function createPreviewWorld({
  billing,
  instances,
}: {
  billing?: BillingAppModel;
  instances?: InstanceAppModel;
}): PreviewWorld {
  const knowsInstance = (slug: string) =>
    billing?.subscriptions.knowsInstance(slug) ||
    instances?.listInstances().some((instance) => instance.slug === slug) ||
    false;

  return {
    addon: (slug) => {
      const addon = billing?.addons.find(slug);

      return addon
        ? {
            addon: { id: addon.id, name: addon.name, slug: addon.slug },
            grants: billing?.addons.grantsOf(slug) ?? [],
            prices: billing?.addons.pricesOf(slug) ?? [],
          }
        : undefined;
    },
    instance: (slug): PreviewInstance | undefined => {
      if (!knowsInstance(slug)) {
        return undefined;
      }
      const history = instances?.usageHistory;

      return {
        measure: history
          ? (entitlementSlug, from, to) =>
              history.measure(slug, entitlementSlug, from, to)
          : undefined,
        periodStart: billing?.subscriptions.livePeriodStartOf(slug),
        retentionStart: history?.retentionStartOf() ?? undefined,
      };
    },
    // The subscriptions and the usage of the world are dated by the clock of the page.
    now: () => new Date(Date.now()),
    voucher: (code) => billing?.vouchers.previewSource(code) ?? 'unknown',
  };
}
