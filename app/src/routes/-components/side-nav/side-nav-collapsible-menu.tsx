import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import {
  isRouteActive,
  type SideNavResolvedSubRoute,
  topLevelButtonClassName,
} from './side-nav.constants';
import { SideNavSubRouteList } from './side-nav-link-item';
import type { useSideNavMenuState } from './use-side-nav-menu-state';

type CollapsedMenuLinkProps = {
  item: SideNavResolvedSubRoute;
  onClick: () => void;
  pathname: string;
};

function CollapsedMenuLink({
  item,
  onClick,
  pathname,
}: CollapsedMenuLinkProps) {
  const active = isRouteActive(pathname, item.path);

  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-2 text-[11px] font-semibold transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        active &&
          'bg-sidebar-accent font-semibold text-sidebar-accent-foreground',
      )}
    >
      {item.label}
    </Link>
  );
}

type CollapsedMenuProps = {
  Icon: LucideIcon;
  isActive: boolean;
  isOpen: boolean;
  isTooltipEnabled: boolean;
  items: SideNavResolvedSubRoute[];
  onOpenChange: (isOpen: boolean) => void;
  onSubItemClick: () => void;
  onTriggerPointerLeave: () => void;
  pathname: string;
  title: string;
};

function CollapsedMenu({
  Icon,
  isActive,
  isOpen,
  isTooltipEnabled,
  items,
  onOpenChange,
  onSubItemClick,
  onTriggerPointerLeave,
  pathname,
  title,
}: CollapsedMenuProps) {
  function renderCollapsedPopoverLink(item: SideNavResolvedSubRoute) {
    return (
      <CollapsedMenuLink
        key={item.path}
        item={item}
        onClick={onSubItemClick}
        pathname={pathname}
      />
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <SidebarMenuButton
            isActive={isActive}
            tooltip={isTooltipEnabled ? title : undefined}
            className={topLevelButtonClassName}
            onPointerLeave={onTriggerPointerLeave}
          >
            <Icon />
            <span>{title}</span>
          </SidebarMenuButton>
        }
      />
      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        className="w-56 border-sidebar-border bg-sidebar p-2 text-sidebar-foreground"
      >
        <div className="px-3 py-1.5 text-xs text-sidebar-foreground/70">
          {title}
        </div>
        <div className="flex flex-col gap-1">
          {items.map(renderCollapsedPopoverLink)}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type ExpandedMenuProps = {
  Icon: LucideIcon;
  isActive: boolean;
  isOpen: boolean;
  items: SideNavResolvedSubRoute[];
  onToggle: () => void;
  pathname: string;
  title: string;
};

function ExpandedMenu({
  Icon,
  isActive,
  isOpen,
  items,
  onToggle,
  pathname,
  title,
}: ExpandedMenuProps) {
  return (
    <>
      <SidebarMenuButton
        type="button"
        isActive={isActive}
        tooltip={title}
        className={cn(topLevelButtonClassName, 'relative pr-8')}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <Icon />
        <span>{title}</span>
        {isOpen ? (
          <ChevronUp className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 opacity-70" />
        ) : (
          <ChevronDown className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 opacity-70" />
        )}
      </SidebarMenuButton>

      {isOpen ? (
        <SideNavSubRouteList items={items} pathname={pathname} />
      ) : null}
    </>
  );
}

type SideNavCollapsibleMenuProps = {
  /** The icon of the section. */
  Icon: LucideIcon;
  /** Whether the page is inside the section, which highlights its button. */
  isActive: boolean;
  isCollapsed: boolean;
  items: SideNavResolvedSubRoute[];
  pathname: string;
  state: ReturnType<typeof useSideNavMenuState>;
  title: string;
};

/**
 * A section of the side navigation that holds sub-entries: a toggle with its
 * entries underneath when the nav is expanded, a popover beside the icon when it
 * is collapsed.
 */
export function SideNavCollapsibleMenu({
  Icon,
  isActive,
  isCollapsed,
  items,
  pathname,
  state,
  title,
}: SideNavCollapsibleMenuProps) {
  if (isCollapsed) {
    return (
      <CollapsedMenu
        Icon={Icon}
        isActive={isActive}
        isOpen={state.isPopoverOpen}
        isTooltipEnabled={!state.isTooltipSuppressed}
        items={items}
        onOpenChange={state.setIsPopoverOpen}
        onSubItemClick={state.handleSubItemClick}
        onTriggerPointerLeave={state.handleTriggerPointerLeave}
        pathname={pathname}
        title={title}
      />
    );
  }

  return (
    <ExpandedMenu
      Icon={Icon}
      isActive={isActive}
      isOpen={state.isOpen}
      items={items}
      onToggle={state.toggle}
      pathname={pathname}
      title={title}
    />
  );
}
