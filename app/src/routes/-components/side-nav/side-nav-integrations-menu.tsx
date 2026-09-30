import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import {
  isRouteActive,
  type SideNavResolvedSubRoute,
  topLevelButtonClassName,
} from './side-nav.constants';
import { SideNavSubRouteList } from './side-nav-link-item';
import type { useSideNavIntegrationsState } from './use-side-nav-integrations-state';

type CollapsedIntegrationsPopoverLinkProps = {
  item: SideNavResolvedSubRoute;
  onClick: () => void;
  pathname: string;
};

function CollapsedIntegrationsPopoverLink({
  item,
  onClick,
  pathname,
}: CollapsedIntegrationsPopoverLinkProps) {
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

type CollapsedIntegrationsMenuProps = {
  isOpen: boolean;
  isTooltipEnabled: boolean;
  items: SideNavResolvedSubRoute[];
  onOpenChange: (isOpen: boolean) => void;
  onSubItemClick: () => void;
  onTriggerPointerLeave: () => void;
  pathname: string;
  title: string;
};

function CollapsedIntegrationsMenu({
  isOpen,
  isTooltipEnabled,
  items,
  onOpenChange,
  onSubItemClick,
  onTriggerPointerLeave,
  pathname,
  title,
}: CollapsedIntegrationsMenuProps) {
  function renderCollapsedPopoverLink(item: SideNavResolvedSubRoute) {
    return (
      <CollapsedIntegrationsPopoverLink
        key={item.path}
        item={item}
        onClick={onSubItemClick}
        pathname={pathname}
      />
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          isActive={isRouteActive(pathname, '/integrations')}
          tooltip={isTooltipEnabled ? title : undefined}
          className={topLevelButtonClassName}
          onPointerLeave={onTriggerPointerLeave}
        >
          <Zap />
          <span>{title}</span>
        </SidebarMenuButton>
      </PopoverTrigger>
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

type ExpandedIntegrationsMenuProps = {
  isOpen: boolean;
  items: SideNavResolvedSubRoute[];
  onToggle: () => void;
  pathname: string;
  title: string;
};

function ExpandedIntegrationsMenu({
  isOpen,
  items,
  onToggle,
  pathname,
  title,
}: ExpandedIntegrationsMenuProps) {
  return (
    <>
      <SidebarMenuButton
        type="button"
        isActive={isRouteActive(pathname, '/integrations')}
        tooltip={title}
        className={cn(topLevelButtonClassName, 'relative pr-8')}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <Zap />
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

type SideNavIntegrationsMenuProps = {
  isCollapsed: boolean;
  items: SideNavResolvedSubRoute[];
  pathname: string;
  state: ReturnType<typeof useSideNavIntegrationsState>;
  title: string;
};

export function SideNavIntegrationsMenu({
  isCollapsed,
  items,
  pathname,
  state,
  title,
}: SideNavIntegrationsMenuProps) {
  if (isCollapsed) {
    return (
      <CollapsedIntegrationsMenu
        isOpen={state.isIntegrationsPopoverOpen}
        isTooltipEnabled={!state.isIntegrationsTooltipSuppressed}
        items={items}
        onOpenChange={state.setIsIntegrationsPopoverOpen}
        onSubItemClick={state.handleSubItemClick}
        onTriggerPointerLeave={state.handleTriggerPointerLeave}
        pathname={pathname}
        title={title}
      />
    );
  }

  return (
    <ExpandedIntegrationsMenu
      isOpen={state.isIntegrationsOpen}
      items={items}
      onToggle={state.toggleIntegrationsMenu}
      pathname={pathname}
      title={title}
    />
  );
}
