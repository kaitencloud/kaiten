import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import {
  childButtonClassName,
  isRouteActive,
  type SideNavResolvedSubRoute,
  topLevelButtonClassName,
} from './side-nav.constants';

type SideNavLinkItemProps = {
  Icon: LucideIcon;
  path: string;
  pathname: string;
  title: string;
};

export function SideNavLinkItem({
  Icon,
  path,
  pathname,
  title,
}: SideNavLinkItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isRouteActive(pathname, path)}
        tooltip={title}
        className={topLevelButtonClassName}
      >
        <Link to={path}>
          <Icon />
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

type SideNavSubRouteItemProps = {
  item: SideNavResolvedSubRoute;
  pathname: string;
};

function SideNavSubRouteItem({ item, pathname }: SideNavSubRouteItemProps) {
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        asChild
        isActive={isRouteActive(pathname, item.path)}
        className={childButtonClassName}
      >
        <Link to={item.path}>
          <span>{item.label}</span>
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

type SideNavSubRouteListProps = {
  items: SideNavResolvedSubRoute[];
  pathname: string;
};

export function SideNavSubRouteList({
  items,
  pathname,
}: SideNavSubRouteListProps) {
  function renderSubRouteItem(item: SideNavResolvedSubRoute) {
    return (
      <SideNavSubRouteItem key={item.path} item={item} pathname={pathname} />
    );
  }

  return (
    <SidebarMenuSub className="mt-1 mx-0 translate-x-0 gap-0.5 border-l-0 px-0">
      {items.map(renderSubRouteItem)}
    </SidebarMenuSub>
  );
}
