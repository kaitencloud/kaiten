import { useTranslation } from 'react-i18next';
import {
  canPerformAction,
  useBillingCapabilities,
  useGrantedScopes,
} from '@/domains/billing';
import { useWebhooksServed } from '@/domains/webhooks';
import {
  billingRoutes,
  billingSubRoutes,
  footerRoutes,
  integrationsSubRoutes,
  type SideNavBillingGate,
  type SideNavResolvedSubRoute,
  type SideNavRouteDefinition,
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

export function useResolvedIntegrationsItems() {
  const { t } = useTranslation();
  const webhooksServed = useWebhooksServed();
  const billing = useBillingCapabilities();
  const { isPending, scopes } = useGrantedScopes();

  // Hidden while the answer is read: an entry that appears a moment later is
  // better than one that vanishes.
  return integrationsSubRoutes
    .filter(({ needsWebhooks }) => !needsWebhooks || webhooksServed)
    .filter(
      ({ needsBilling }) =>
        !needsBilling ||
        (billing.has() &&
          (needsBilling.action === undefined ||
            (!isPending && canPerformAction(scopes, needsBilling.action)))),
    )
    .map(({ labelKey, path }): SideNavResolvedSubRoute => ({
      label: t(labelKey),
      path,
    }));
}

/**
 * The entries of the Billing section the running deployment offers, to the session
 * that can use them. The list is empty while the capabilities load and when they
 * cannot be read, and the section is not drawn. An entry that names an action is
 * listed once the scopes of the session cover it: the add-ons are not offered to a
 * session that may not read them.
 */
export function useResolvedBillingItems() {
  const { t } = useTranslation();
  const isListed = useIsBillingEntryListed();

  return billingSubRoutes
    .filter(isListed)
    .map(({ labelKey, path }): SideNavResolvedSubRoute => ({
      label: t(labelKey),
      path,
    }));
}

export function SideNavFooterRoutes({ pathname }: SideNavRoutesProps) {
  return <SideNavRouteList pathname={pathname} routes={footerRoutes} />;
}
