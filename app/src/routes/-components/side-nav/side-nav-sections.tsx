import { useTranslation } from 'react-i18next';
import { useBillingCapabilities } from '@/domains/billing';
import { useWebhooksServed } from '@/domains/webhooks';
import {
  billingSubRoutes,
  footerRoutes,
  integrationsSubRoutes,
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

export function SideNavPrimaryRoutes({ pathname }: SideNavRoutesProps) {
  return <SideNavRouteList pathname={pathname} routes={topLevelRoutes} />;
}

export function useResolvedIntegrationsItems() {
  const { t } = useTranslation();
  const webhooksServed = useWebhooksServed();

  // Hidden while the answer is read: an entry that appears a moment later is
  // better than one that vanishes.
  return integrationsSubRoutes
    .filter(({ needsWebhooks }) => !needsWebhooks || webhooksServed)
    .map(({ labelKey, path }): SideNavResolvedSubRoute => ({
      label: t(labelKey),
      path,
    }));
}

/**
 * The entries of the Billing section the running deployment offers. Billing is
 * off until its capabilities say otherwise, so the list is empty while they load
 * and when they cannot be read, and the section is not drawn.
 */
export function useResolvedBillingItems() {
  const { t } = useTranslation();
  const billing = useBillingCapabilities();

  return billingSubRoutes
    .filter(({ capability }) => billing.has(capability.feature))
    .map(({ labelKey, path }): SideNavResolvedSubRoute => ({
      label: t(labelKey),
      path,
    }));
}

export function SideNavFooterRoutes({ pathname }: SideNavRoutesProps) {
  return <SideNavRouteList pathname={pathname} routes={footerRoutes} />;
}
