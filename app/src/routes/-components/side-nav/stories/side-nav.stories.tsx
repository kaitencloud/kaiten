import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { ReactNode } from 'react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { webhooksServedQueryOptions } from '@/domains/webhooks';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { SideNav } from '../side-nav';
import { SideNavIntegrationsMenu } from '../side-nav-integrations-menu';
import {
  SideNavFooterRoutes,
  SideNavPrimaryRoutes,
  useResolvedIntegrationsItems,
} from '../side-nav-sections';
import { useSideNavIntegrationsState } from '../use-side-nav-integrations-state';

const meta = {
  title: 'Routes/SideNav',
  component: SideNav,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SideNav>;

export default meta;
type Story = StoryObj<typeof SideNav>;

// What decides the Webhooks entry: Kaiten Cloud, where webhooks are served to the
// organization, unless a story says otherwise. Seeded, so no story asks an API
// Storybook does not have.
function SideNavStoryRouter({
  children,
  defaultOpen = true,
  initialEntry,
  routePath,
  webhooksServed = true,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  initialEntry: string;
  routePath: string;
  webhooksServed?: boolean;
}) {
  return (
    <StorybookRouter
      initialEntries={[initialEntry]}
      routePath={routePath}
      seed={(queryClient) =>
        queryClient.setQueryData(
          webhooksServedQueryOptions.queryKey,
          webhooksServed,
        )
      }
    >
      <SidebarProvider defaultOpen={defaultOpen} className="min-h-[720px]">
        {children}
      </SidebarProvider>
    </StorybookRouter>
  );
}

function SideNavWithContent({
  defaultOpen,
  initialEntry,
  routePath,
}: {
  defaultOpen?: boolean;
  initialEntry: string;
  routePath: string;
}) {
  return (
    <SideNavStoryRouter
      defaultOpen={defaultOpen}
      initialEntry={initialEntry}
      routePath={routePath}
    >
      <SideNav />
      <div className="flex min-h-[720px] flex-1 flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1 cursor-pointer" />
          <span className="text-muted-foreground text-sm">Customers</span>
        </header>
        <main className="flex flex-1 items-center justify-center p-8">
          <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
            <p className="font-semibold">Application canvas</p>
            <p className="mt-1 text-muted-foreground text-sm">
              Use the trigger in the header to collapse or expand the
              navigation.
            </p>
          </div>
        </main>
      </div>
    </SideNavStoryRouter>
  );
}

function SideNavSectionsPreview() {
  return (
    <SideNavStoryRouter
      initialEntry="/releases/components"
      routePath="/releases/components"
    >
      <div className="w-72 border-r bg-sidebar p-3 text-sidebar-foreground">
        <SidebarMenu className="gap-1.5">
          <SideNavPrimaryRoutes pathname="/releases/components" />
          <SideNavFooterRoutes pathname="/settings" />
        </SidebarMenu>
      </div>
    </SideNavStoryRouter>
  );
}

// Under the router, which seeds the flag the entries are resolved from.
function IntegrationsMenuContent({
  collapsed,
  pathname,
}: {
  collapsed: boolean;
  pathname: string;
}) {
  const items = useResolvedIntegrationsItems();
  const state = useSideNavIntegrationsState(true);

  return (
    <div className="w-72 border-r bg-sidebar p-3 text-sidebar-foreground group-data-[collapsible=icon]:w-14">
      <SidebarMenu className="gap-1.5">
        <SidebarMenuItem>
          <SideNavIntegrationsMenu
            isCollapsed={collapsed}
            items={items}
            pathname={pathname}
            state={state}
            title="Integrations"
          />
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
}

function IntegrationsMenuPreview({
  collapsed = false,
  pathname = '/integrations/webhooks',
  webhooksServed,
}: {
  collapsed?: boolean;
  pathname?: string;
  webhooksServed?: boolean;
}) {
  return (
    <SideNavStoryRouter
      defaultOpen={!collapsed}
      initialEntry={pathname}
      routePath={pathname}
      webhooksServed={webhooksServed}
    >
      <IntegrationsMenuContent collapsed={collapsed} pathname={pathname} />
    </SideNavStoryRouter>
  );
}

export const Expanded: Story = {
  render: () => (
    <SideNavWithContent initialEntry="/customers" routePath="/customers" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('link', { name: 'Customers' }),
    ).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Releases' })).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'Feature Flags' }),
    ).toBeVisible();

    // The footer holds the audit trail, right above Settings.
    const footer = canvasElement.querySelector<HTMLElement>(
      '[data-sidebar="footer"]',
    );

    if (!footer) {
      throw new Error('The side nav renders no footer');
    }

    await expect(
      within(footer)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Audit trail', 'Settings']);
  },
};

export const IntegrationsActive: Story = {
  render: () => (
    <SideNavWithContent
      initialEntry="/integrations/webhooks"
      routePath="/integrations/webhooks"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('button', { name: /integrations/i }),
    ).toBeVisible();
  },
};

export const Collapsed: Story = {
  render: () => (
    <SideNavWithContent
      defaultOpen={false}
      initialEntry="/releases/components"
      routePath="/releases/components"
    />
  ),
};

export const SectionsOnly: Story = {
  render: () => <SideNavSectionsPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('link', { name: 'Customers' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'Audit trail' }),
    ).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Settings' })).toBeVisible();
  },
};

export const IntegrationsMenu: Story = {
  render: () => <IntegrationsMenuPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('button', { name: /integrations/i }),
    ).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Webhooks' })).toBeVisible();
  },
};

// A self-hosted deployment: no saas-api answers /api/webhooks, so the menu goes
// without the pages it would have served. An organization whose licence does not
// carry webhooks sees the same menu.
export const IntegrationsMenuSelfHosted: Story = {
  render: () => (
    <IntegrationsMenuPreview
      pathname="/integrations/connectors"
      webhooksServed={false}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('button', {
      name: /integrations/i,
    });

    if (trigger.getAttribute('aria-expanded') !== 'true') {
      await userEvent.click(trigger);
    }
    await expect(
      canvas.getByRole('link', { name: 'Connectors' }),
    ).toBeVisible();
    await expect(canvas.queryByRole('link', { name: 'Webhooks' })).toBeNull();
  },
};
