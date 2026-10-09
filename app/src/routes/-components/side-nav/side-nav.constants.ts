import { Gauge, type LucideIcon, ScrollText, Settings } from 'lucide-react';
import type { BillingAction, BillingFeatureKey } from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';

export type SideNavRouteDefinition = {
  Icon: LucideIcon;
  path: string;
  titleKey: string;
};

export type SideNavSubRouteDefinition = {
  labelKey: string;
  path: string;
  /**
   * Whether this entry needs outbound webhooks to be served to the organization
   * (`domains/webhooks`): listed only where they are, and always when absent.
   * The entry's route guards itself as well, so a hidden entry is not merely a
   * missing link.
   */
  needsWebhooks?: boolean;
};

/** An entry of the Billing section. */
export type SideNavBillingRouteDefinition = {
  /**
   * What the entry needs of the session besides: the action its screen is for,
   * listed only to a session whose scopes cover it. An entry of a catalogue the
   * session may not read leads nowhere it can use. Hidden while the scopes of the
   * token are read, as an entry that appears a moment later is better than one that
   * vanishes. Optional: the capabilities already ask for the scope of billing.
   */
  action?: BillingAction;
  /**
   * What the entry needs of billing (`GET /billing/capabilities`): billing on
   * and, when a `feature` is named, a release that ships it. It is hidden while
   * the capabilities load and whenever they cannot be read. Required, so that an
   * entry cannot be added that would show where billing is off. The entry's
   * route guards itself as well.
   */
  capability: { feature?: BillingFeatureKey };
  labelKey: string;
  path: string;
};

export type SideNavResolvedSubRoute = {
  label: string;
  path: string;
};

export const topLevelRoutes: SideNavRouteDefinition[] = [
  {
    Icon: Gauge,
    path: '/dashboard',
    titleKey: 'Pages.Dashboard.title',
  },
  {
    Icon: dataModelIcons.customer,
    path: '/customers',
    titleKey: 'Pages.Customers.title',
  },
  {
    Icon: dataModelIcons.featureFlag,
    path: '/feature-flags',
    titleKey: 'Pages.FeatureFlags.title',
  },
  {
    Icon: dataModelIcons.entitlement,
    path: '/entitlements',
    titleKey: 'Pages.Entitlements.title',
  },
  {
    Icon: dataModelIcons.license,
    path: '/licenses',
    titleKey: 'Pages.Licenses.title',
  },
  {
    Icon: dataModelIcons.release,
    path: '/releases',
    titleKey: 'Pages.Releases.title',
  },
];

// Pinned to the bottom of the nav, below the primary routes.
export const footerRoutes: SideNavRouteDefinition[] = [
  {
    Icon: ScrollText,
    path: '/audit-trail',
    titleKey: 'Pages.AuditTrail.title',
  },
  {
    Icon: Settings,
    path: '/settings',
    titleKey: 'Pages.Settings.title',
  },
];

export const integrationsSubRoutes: SideNavSubRouteDefinition[] = [
  {
    labelKey: 'Pages.Integrations.ServiceAccounts.title',
    path: '/integrations/service-accounts',
  },
  {
    labelKey: 'Pages.Integrations.Webhooks.sectionTitle',
    path: '/integrations/webhooks',
    needsWebhooks: true,
  },
  {
    labelKey: 'Pages.Integrations.Connectors.title',
    path: '/integrations/connectors',
  },
];

// The Billing section: shown where billing is on, entry by entry by what the
// release ships. It sits in the nav as one section because it is one gate.
export const billingSubRoutes: SideNavBillingRouteDefinition[] = [
  {
    capability: {},
    labelKey: 'Pages.Billing.Invoices.title',
    path: '/billing/invoices',
  },
  {
    capability: {},
    labelKey: 'Pages.Billing.Handoff.title',
    path: '/billing/handoff',
  },
  {
    action: 'addons.list',
    capability: { feature: 'addons' },
    labelKey: 'Pages.Addons.title',
    path: '/addons',
  },
  {
    capability: { feature: 'vouchers' },
    labelKey: 'Pages.Vouchers.title',
    path: '/vouchers',
  },
];

export const sideNavAssets = {
  logoDark: '/images/logo-color-white.svg',
  logoIconDark: '/images/logo-icon-color.svg',
  logoLight: '/images/logo-color-black.svg',
};

export const topLevelButtonClassName =
  'h-9 px-2.5 py-1.5 text-[13px] font-semibold [&>svg]:size-[18px] group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-2!';

export const childButtonClassName =
  'h-8 w-full px-2.5 pr-2 text-[11px] font-semibold pl-9';

export function isRouteActive(pathname: string, routePath: string) {
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}
