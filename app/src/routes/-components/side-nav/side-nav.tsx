import { useLocation } from '@tanstack/react-router';
import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { dataModelIcons } from '@/lib/data-model-icons';
import { isRouteActive } from './side-nav.constants';
import { SideNavCollapsibleMenu } from './side-nav-collapsible-menu';
import { SideNavLogo } from './side-nav-logo';
import {
  SideNavFooterRoutes,
  SideNavPrimaryRoutes,
  useResolvedBillingItems,
  useResolvedIntegrationsItems,
} from './side-nav-sections';
import { useSideNavMenuState } from './use-side-nav-menu-state';

export function SideNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const billingItems = useResolvedBillingItems();
  const isBillingActive = billingItems.some((item) =>
    isRouteActive(pathname, item.path),
  );
  const billingState = useSideNavMenuState(isBillingActive);
  const integrationsItems = useResolvedIntegrationsItems();
  const isIntegrationsActive = isRouteActive(pathname, '/integrations');
  const integrationsState = useSideNavMenuState(isIntegrationsActive);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="mb-4 px-2 pt-5 group-data-[collapsible=icon]:items-center">
        <SideNavLogo isCollapsed={isCollapsed} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5 group-data-[collapsible=icon]:items-center">
              <SideNavPrimaryRoutes pathname={pathname} />
              {billingItems.length > 0 ? (
                <SidebarMenuItem>
                  <SideNavCollapsibleMenu
                    Icon={dataModelIcons.billing}
                    isActive={isBillingActive}
                    isCollapsed={isCollapsed}
                    items={billingItems}
                    pathname={pathname}
                    state={billingState}
                    title={t('Pages.Billing.title')}
                  />
                </SidebarMenuItem>
              ) : null}
              <SidebarMenuItem>
                <SideNavCollapsibleMenu
                  Icon={Zap}
                  isActive={isIntegrationsActive}
                  isCollapsed={isCollapsed}
                  items={integrationsItems}
                  pathname={pathname}
                  state={integrationsState}
                  title={t('Pages.Integrations.title')}
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2 pb-5">
        <SidebarMenu className="gap-1.5 group-data-[collapsible=icon]:items-center">
          <SideNavFooterRoutes pathname={pathname} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
