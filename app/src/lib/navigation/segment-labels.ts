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
  handoff: 'Pages.Billing.Handoff.title',
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

// The side nav's sections: whatever lies under one of them, the section's own
// page exists.
const SECTIONS = new Set([
  'addons',
  'audit-trail',
  'billing',
  'customers',
  'dashboard',
  'entitlements',
  'feature-flags',
  'integrations',
  'invoices',
  'licenses',
  'notifications',
  'releases',
  'settings',
  'vouchers',
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

/** The side-nav section a path lies under, if any. */
export function getSectionForPath(
  pathname: string,
  t: TFunction,
): Section | undefined {
  const [segment] = pathname.split('/').filter(Boolean);

  if (!segment || !SECTIONS.has(segment)) {
    return undefined;
  }

  return { href: `/${segment}`, label: getSegmentLabel(segment, t) };
}
