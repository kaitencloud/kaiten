import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { useState } from 'react';
import { PathBreadcrumbs } from '../path-breadcrumbs';

const meta = {
  title: 'Routes/PathBreadcrumbs',
  component: PathBreadcrumbs,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PathBreadcrumbs>;

export default meta;
type Story = StoryObj<typeof PathBreadcrumbs>;

function BreadcrumbCanvas() {
  return (
    <div className="space-y-6 rounded-lg border bg-background p-6">
      <PathBreadcrumbs />
      <div className="rounded-md bg-muted/60 p-4 text-muted-foreground text-sm">
        Route content preview
      </div>
    </div>
  );
}

const customerTitles: Record<string, string> = {
  'acme-corp': 'Acme Corp',
  'globex': 'Globex',
};

const instanceTitles: Record<string, string> = {
  'production-eu': 'Production EU',
  'staging-us': 'Staging US',
};

function BreadcrumbStoryRouter({ initialEntry }: { initialEntry: string }) {
  const [router] = useState(() => {
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <BreadcrumbCanvas />
          <Outlet />
        </>
      ),
    });

    const customersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'customers',
      beforeLoad: () => ({ getTitle: () => 'Customers' }),
      component: Outlet,
    });

    const customerRoute = createRoute({
      getParentRoute: () => customersRoute,
      path: '$customerSlug',
      beforeLoad: ({ params }) => ({
        getTitle: () =>
          customerTitles[params.customerSlug] ?? params.customerSlug,
      }),
      component: Outlet,
    });

    const instancesRoute = createRoute({
      getParentRoute: () => customerRoute,
      path: 'instances',
      beforeLoad: () => ({ getTitle: () => 'Instances' }),
      component: Outlet,
    });

    const instanceRoute = createRoute({
      getParentRoute: () => instancesRoute,
      path: '$instanceSlug',
      beforeLoad: ({ params }) => ({
        getTitle: () =>
          instanceTitles[params.instanceSlug] ?? params.instanceSlug,
      }),
      component: Outlet,
    });

    const settingsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'settings',
      component: Outlet,
    });

    const advancedSettingsRoute = createRoute({
      getParentRoute: () => settingsRoute,
      path: 'advanced',
      component: Outlet,
    });

    return createRouter({
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
      routeTree: rootRoute.addChildren([
        customersRoute.addChildren([
          customerRoute.addChildren([
            instancesRoute.addChildren([instanceRoute]),
          ]),
        ]),
        settingsRoute.addChildren([advancedSettingsRoute]),
      ]),
    });
  });

  return <RouterProvider router={router} />;
}

export const DynamicTitles: Story = {
  render: () => (
    <BreadcrumbStoryRouter initialEntry="/customers/acme-corp/instances/production-eu" />
  ),
};

export const FallbackLabels: Story = {
  render: () => <BreadcrumbStoryRouter initialEntry="/settings/advanced" />,
};

export const HomeRoute: Story = {
  render: () => <BreadcrumbStoryRouter initialEntry="/" />,
};
