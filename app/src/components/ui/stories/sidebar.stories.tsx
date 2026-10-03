import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Bell,
  Gauge,
  LifeBuoy,
  MoreHorizontal,
  PackageCheck,
  Search,
  Settings,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '../sidebar';

const meta = {
  title: 'Components/UI/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof Sidebar>;

const menuItems = [
  { icon: Gauge, label: 'Dashboard', active: true, badge: undefined },
  { icon: Shield, label: 'Entitlements', active: false, badge: '3' },
  { icon: PackageCheck, label: 'Releases', active: false, badge: undefined },
];

function DemoSidebar({
  variant = 'sidebar',
}: {
  variant?: 'sidebar' | 'floating' | 'inset';
}) {
  return (
    <Sidebar collapsible="icon" variant={variant}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Kaiten">
              <PackageCheck />
              <span>Kaiten</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarInput placeholder="Search..." />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupAction aria-label="More workspace actions">
            <MoreHorizontal />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton isActive={item.active} tooltip={item.label}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {item.badge ? (
                    <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                  ) : null}
                  {!item.active ? (
                    <SidebarMenuAction aria-label={`Open ${item.label} menu`}>
                      <MoreHorizontal />
                    </SidebarMenuAction>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Integrations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Bell />
                  <span>Webhooks</span>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton href="#events" isActive>
                      <span>Events</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton href="#history">
                      <span>History</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Support">
              <LifeBuoy />
              <span>Support</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings">
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function SidebarFrame({
  defaultOpen = true,
  variant = 'sidebar',
}: {
  defaultOpen?: boolean;
  variant?: 'sidebar' | 'floating' | 'inset';
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen} className="min-h-[640px]">
      <DemoSidebar variant={variant} />
      <SidebarInset className="min-h-[640px] p-6">
        <div className="flex items-center gap-2 border-b pb-4">
          <SidebarTrigger />
          <Button aria-label="Search" variant="outline" size="icon">
            <Search />
          </Button>
        </div>
        <div className="grid flex-1 place-items-center">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <p className="font-semibold">Sidebar {variant}</p>
            <p className="text-muted-foreground text-sm">
              Primary content area aligned with the sidebar provider.
            </p>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export const Expanded: Story = {
  render: () => <SidebarFrame />,
};

export const Collapsed: Story = {
  render: () => <SidebarFrame defaultOpen={false} />,
};

export const Floating: Story = {
  render: () => (
    <SidebarProvider defaultOpen className="min-h-[640px] bg-sidebar">
      <DemoSidebar variant="floating" />
      <SidebarInset className="min-h-[640px] p-6">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          Floating sidebar variant
        </div>
      </SidebarInset>
    </SidebarProvider>
  ),
};

export const LoadingMenu: Story = {
  render: () => (
    <div className="w-72 rounded-lg border bg-sidebar p-3 text-sidebar-foreground">
      <SidebarProvider>
        <SidebarMenu>
          <SidebarMenuItem><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};
