import { useTranslation } from 'react-i18next';
import {
  canPerformAction,
  useBillingCapabilities,
  useGrantedScopes,
} from '@/domains/billing';
import { useWebhooksServed } from '@/domains/webhooks';
import {
  billingRoutes,
  catalogSubRoutes,
  footerRoutes,
  integrationsSubRoutes,
  type SideNavBillingGate,
  type SideNavResolvedSubRoute,
  type SideNavRouteDefinition,
  type SideNavSubRouteDefinition,
  topLevelRoutes,
} from './side-nav.constants';
import { SideNavLinkItem } from './side-nav-link-item';

type SideNavRoutesProps = {
  pathname: string;
};

function SideNavRoute({
  pathname,
  route,
}: {
  pathname: string;
  route: SideNavRouteDefinition;
}) {
  const { t } = useTranslation();

  return (
    <SideNavLinkItem
      Icon={route.Icon}
      path={route.path}
      pathname={pathname}
      title={t(route.titleKey)}
    />
  );
}

type SideNavRouteListProps = SideNavRoutesProps & {
  routes: SideNavRouteDefinition[];
};

function SideNavRouteList({ pathname, routes }: SideNavRouteListProps) {
  function renderRoute(route: SideNavRouteDefinition) {
    return <SideNavRoute key={route.path} pathname={pathname} route={route} />;
  }

  return <>{routes.map(renderRoute)}</>;
}

/**
 * Whether an entry of billing is listed to this session: billing is on and, when
 * the entry names a `feature`, the release ships it; and, when it names an `action`,
 * the scopes of the session cover it. Billing is off until its capabilities say
 * otherwise, so nothing is listed while they load and when they cannot be read.
 */
function useIsBillingEntryListed() {
  const billing = useBillingCapabilities();
  const { isPending, scopes } = useGrantedScopes();

  return ({ action, capability }: SideNavBillingGate) =>
    billing.has(capability.feature) &&
    (action === undefined || (!isPending && canPerformAction(scopes, action)));
}

/**
 * The first-level entries of billing the running deployment offers, to the session
 * that can use them: the invoices, where billing is on.
 */
export function useResolvedBillingRoutes(): SideNavRouteDefinition[] {
  const isListed = useIsBillingEntryListed();

  return billingRoutes.filter(isListed);
}

export function SideNavPrimaryRoutes({ pathname }: SideNavRoutesProps) {
  const billing = useResolvedBillingRoutes();

  return (
    <SideNavRouteList
      pathname={pathname}
      routes={[...topLevelRoutes, ...billing]}
    />
  );
}

/**
 * The entries of a section the running deployment offers, to the session that can
 * use them: an entry that needs webhooks is listed where they are served, and one
 * that needs billing where billing is on, the release ships what it names and the
 * scopes of the session cover its action. Hidden while the answers are read: an
 * entry that appears a moment later is better than one that vanishes.
 */
function useResolvedSubRoutes(
  definitions: SideNavSubRouteDefinition[],
): SideNavResolvedSubRoute[] {
  const { t } = useTranslation();
  const webhooksServed = useWebhooksServed();
  const isListed = useIsBillingEntryListed();

  return definitions
    .filter(({ needsWebhooks }) => !needsWebhooks || webhooksServed)
    .filter(({ needsBilling }) => !needsBilling || isListed(needsBilling))
    .map(({ labelKey, path }) => ({ label: t(labelKey), path }));
}

export function useResolvedIntegrationsItems() {
  return useResolvedSubRoutes(integrationsSubRoutes);
}

/**
 * The entries of the Catalog section: the licenses and the entitlements always, the
 * add-ons and the vouchers where billing is on and the release ships them, to a
 * session that may read them.
 */
export function useResolvedCatalogItems() {
  return useResolvedSubRoutes(catalogSubRoutes);
}

export function SideNavFooterRoutes({ pathname }: SideNavRoutesProps) {
  return <SideNavRouteList pathname={pathname} routes={footerRoutes} />;
}
