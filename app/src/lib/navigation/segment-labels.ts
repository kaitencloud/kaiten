import type { TFunction } from 'i18next';

// A URL segment names a place in the app. These are the labels the side nav,
// the tabs and the page headers already give those places.
const SEGMENT_LABEL_KEYS: Record<string, string> = {
  addons: 'Pages.Addons.title',
  'attach-addon':
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.title',
  'audit-trail': 'Pages.AuditTrail.title',
  billing: 'Pages.Billing.title',
  cancel: 'Pages.Customers.Instances.Detail.Billing.Cancel.title',
  catalog: 'Pages.Catalog.title',
  compatibility: 'Pages.Addons.Compatibility.title',
  components: 'Pages.Releases.Components.title',
  connectors: 'Pages.Integrations.Connectors.title',
  customers: 'Pages.Customers.title',
  dashboard: 'Pages.Dashboard.title',
  deploy: 'Features.Releases.Actions.deploy',
  'deployment-zone': 'Pages.Releases.DeploymentZones.title',
  'deployment-zones': 'Pages.Releases.DeploymentZones.title',
  deployments: 'Pages.Releases.Deployments.title',
  edit: 'Common.edit',
  entitlements: 'Pages.Entitlements.title',
  'feature-flags': 'Pages.FeatureFlags.title',
  history: 'Pages.Integrations.Webhooks.Tabs.history',
  instances: 'Pages.Customers.Instances.title',
  integrations: 'Pages.Integrations.title',
  invoices: 'Pages.Billing.Invoices.title',
  licenses: 'Pages.Licenses.title',
  lines: 'Pages.Billing.Invoices.Lines.title',
  new: 'Common.new',
  notifications: 'Pages.Notifications.title',
  'plan-change': 'Pages.Customers.Instances.Detail.Billing.PlanChange.title',
  prices: 'Pages.Licenses.Prices.title',
  'publishable-keys': 'Pages.Integrations.PublishableKeys.title',
  'redeem-voucher':
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.breadcrumb',
  releases: 'Pages.Releases.title',
  'service-accounts': 'Pages.Integrations.ServiceAccounts.title',
  settings: 'Pages.Settings.title',
  subscribe: 'Pages.Customers.Instances.Detail.Billing.Subscribe.title',
  terms: 'Pages.Customers.Instances.Detail.Billing.Terms.title',
  vouchers: 'Pages.Vouchers.title',
  webhooks: 'Pages.Integrations.Webhooks.sectionTitle',
};

// The side nav's sections, by path: whatever lies under one of them, the
// section's own page exists. The entries of the catalog are sections of their
// own, so that the way back from a license that does not exist is the licenses,
// not the catalog.
const SECTIONS = new Set([
  'audit-trail',
  'catalog',
  'catalog/addons',
  'catalog/entitlements',
  'catalog/licenses',
  'catalog/vouchers',
  'customers',
  'dashboard',
  'feature-flags',
  'integrations',
  'invoices',
  'notifications',
  'releases',
  'settings',
]);

export type Section = {
  href: string;
  label: string;
};

/** `service-accounts` → `Service Accounts`, for a segment with no label. */
export function humanizeSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getSegmentLabel(segment: string, t: TFunction): string {
  const key = SEGMENT_LABEL_KEYS[segment];
  const fallback = humanizeSegment(segment);

  return key ? t(key, { defaultValue: fallback }) : fallback;
}

/** The side-nav section a path lies under, if any: the deepest one it names. */
export function getSectionForPath(
  pathname: string,
  t: TFunction,
): Section | undefined {
  const [first, second] = pathname.split('/').filter(Boolean);
  const nested = first && second ? `${first}/${second}` : undefined;
  const section = nested && SECTIONS.has(nested) ? nested : first;

  if (!section || !SECTIONS.has(section)) {
    return undefined;
  }

  return {
    href: `/${section}`,
    label: getSegmentLabel(section.split('/').pop() ?? section, t),
  };
}
