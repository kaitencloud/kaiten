import { useLocation } from '@tanstack/react-router';
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
import { isRouteActive } from './side-nav.constants';
import { SideNavIntegrationsMenu } from './side-nav-integrations-menu';
import { SideNavLogo } from './side-nav-logo';
import {
  SideNavFooterRoutes,
  SideNavPrimaryRoutes,
  useResolvedIntegrationsItems,
} from './side-nav-sections';
import { useSideNavIntegrationsState } from './use-side-nav-integrations-state';

export function SideNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const integrationsItems = useResolvedIntegrationsItems();
  const integrationsState = useSideNavIntegrationsState(
    isRouteActive(pathname, '/integrations'),
  );

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
              <SidebarMenuItem>
                <SideNavIntegrationsMenu
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
