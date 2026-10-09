import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { PathBreadcrumbs } from './path-breadcrumbs';

const mockUseMatches = vi.fn();
let mockRoutesByPath: Record<string, unknown> = {};
// Where the browser is; by default the deepest match, as on any real page.
let mockLocationPathname: string | undefined;

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useMatches: () => mockUseMatches(),
  useRouter: () => ({ routesByPath: mockRoutesByPath }),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) =>
    select({
      location: {
        pathname:
          mockLocationPathname ??
          (mockUseMatches() as { pathname: string }[]).at(-1)?.pathname ??
          '/',
      },
    }),
}));

const translations: Record<string, string> = {
  'Common.new': 'New',
  'Errors.notFound': 'Page not found',
  'Features.Releases.Actions.deploy': 'Deploy',
  'Pages.Billing.Invoices.title': 'Invoices',
  'Pages.Catalog.title': 'Catalog',
  'Pages.Customers.Instances.title': 'Instances',
  'Pages.Customers.title': 'Customers',
  'Pages.FeatureFlags.title': 'Feature Flags',
  'Pages.Integrations.Webhooks.Tabs.history': 'History',
  'Pages.Integrations.title': 'Integrations',
  'Pages.Licenses.Prices.title': 'Prices',
  'Pages.Licenses.title': 'Licenses',
  'Pages.Releases.DeploymentZones.title': 'Deployment Zones',
  'Pages.Releases.title': 'Releases',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('PathBreadcrumbs', () => {
  beforeEach(() => {
    mockUseMatches.mockReset();
    mockRoutesByPath = {};
    mockLocationPathname = undefined;
    document.title = '';
  });

  it('labels a path by its segment when the title is inherited across different pathnames', () => {
    const inheritedWebhooksTitle = () => 'Webhooks';

    mockUseMatches.mockReturnValue([
      {
        pathname: '/',
        context: {},
      },
      {
        pathname: '/integrations',
        context: {},
      },
      {
        pathname: '/integrations/webhooks',
        context: {
          getTitle: inheritedWebhooksTitle,
        },
      },
      {
        pathname: '/integrations/webhooks/history',
        context: {
          getTitle: inheritedWebhooksTitle,
        },
      },
    ]);

    render(<PathBreadcrumbs />);

    expect(
      screen.getByRole('link', {
        name: 'Integrations',
      }),
    ).toHaveAttribute('href', '/integrations');
    expect(
      screen.getByRole('link', {
        name: 'Webhooks',
      }),
    ).toHaveAttribute('href', '/integrations/webhooks');
    expect(
      screen.getByRole('link', {
        current: 'page',
        name: 'History',
      }),
    ).toBeInTheDocument();
  });

  it('shows the entity name instead of the slug when a layout route and its index share the same pathname', () => {
    // Simulates the pattern used throughout the app:
    //   route.tsx  → layout route that sets getTitle in beforeLoad
    //   index.tsx  → index route that inherits the *same* getTitle reference
    // Both matches resolve to the same pathname, so the index match must NOT
    // overwrite the correct name with the slug.
    const instanceGetTitle = () => "Tom's account 10 Production";

    mockUseMatches.mockReturnValue([
      {
        pathname: '/',
        context: {},
      },
      {
        pathname: '/customers',
        context: {},
      },
      {
        pathname: '/customers/instances',
        context: {},
      },
      // Layout route (route.tsx) — sets the real title
      {
        pathname: '/customers/instances/tom-s-account-10-production-6827d1',
        context: {
          getTitle: instanceGetTitle,
        },
      },
      // Index route (index.tsx) — inherits the same getTitle function reference
      {
        pathname: '/customers/instances/tom-s-account-10-production-6827d1',
        context: {
          getTitle: instanceGetTitle,
        },
      },
    ]);

    render(<PathBreadcrumbs />);

    expect(screen.getByRole('link', { name: 'Customers' })).toHaveAttribute(
      'href',
      '/customers',
    );

    expect(screen.getByRole('link', { name: 'Instances' })).toHaveAttribute(
      'href',
      '/customers/instances',
    );

    // Must show the human-readable name, NOT the capitalised slug
    expect(
      screen.getByRole('link', {
        current: 'page',
        name: "Tom's account 10 Production",
      }),
    ).toBeInTheDocument();

    // The raw slug must not appear anywhere in the breadcrumbs
    expect(
      screen.queryByText(/tom-s-account-10-production-6827d1/i),
    ).not.toBeInTheDocument();
  });

  it('names sections as the side nav does and titles the tab after the trail', () => {
    mockRoutesByPath = {
      '/feature-flags': {},
      '/feature-flags/$featureFlagSlug': {},
      '/feature-flags/$featureFlagSlug/targeting': {},
    };
    mockUseMatches.mockReturnValue([
      { pathname: '/', fullPath: '/', context: {} },
      {
        pathname: '/feature-flags/is-kaiten',
        fullPath: '/feature-flags/$featureFlagSlug',
        context: { getTitle: () => 'Is Kaiten' },
      },
      {
        pathname: '/feature-flags/is-kaiten/targeting',
        fullPath: '/feature-flags/$featureFlagSlug/targeting',
        context: { getTitle: () => 'Targeting' },
      },
    ]);

    render(<PathBreadcrumbs />);

    expect(screen.getByRole('link', { name: 'Feature Flags' })).toHaveAttribute(
      'href',
      '/feature-flags',
    );
    expect(screen.getByRole('link', { name: 'Is Kaiten' })).toHaveAttribute(
      'href',
      '/feature-flags/is-kaiten',
    );
    expect(document.title).toBe(
      'Targeting · Is Kaiten · Feature Flags · Kaiten',
    );
  });

  it('reads a license under the catalog, which opens on the licenses', () => {
    mockRoutesByPath = {
      '/catalog': {},
      '/catalog/licenses': {},
      '/catalog/licenses/$licenseSlug': {},
      '/catalog/licenses/$licenseSlug/prices': {},
    };
    mockUseMatches.mockReturnValue([
      { pathname: '/', fullPath: '/', context: {} },
      {
        pathname: '/catalog/licenses/pro-v2/prices',
        fullPath: '/catalog/licenses/$licenseSlug/prices',
        context: { getTitle: () => 'Pro' },
      },
    ]);

    render(<PathBreadcrumbs />);

    expect(screen.getByRole('link', { name: 'Catalog' })).toHaveAttribute(
      'href',
      '/catalog',
    );
    expect(screen.getByRole('link', { name: 'Licenses' })).toHaveAttribute(
      'href',
      '/catalog/licenses',
    );
    expect(document.title).toBe('Prices · Pro · Licenses · Catalog · Kaiten');
  });

  it('gives a slug level with no page of its own the entity name, as text', () => {
    mockRoutesByPath = {
      '/releases': {},
      '/releases/deployment-zones': {},
      '/releases/deployment-zones/$zoneSlug/deploy': {},
    };
    mockUseMatches.mockReturnValue([
      { pathname: '/', fullPath: '/', context: {} },
      { pathname: '/releases', fullPath: '/releases', context: {} },
      {
        pathname: '/releases/deployment-zones',
        fullPath: '/releases/deployment-zones',
        context: {},
      },
      {
        pathname: '/releases/deployment-zones/ux-review-staging/deploy',
        fullPath: '/releases/deployment-zones/$zoneSlug/deploy',
        context: { getTitle: () => 'UX Review Staging' },
      },
    ]);

    render(<PathBreadcrumbs />);

    expect(
      screen.getByRole('link', { name: 'Deployment Zones' }),
    ).toHaveAttribute('href', '/releases/deployment-zones');
    expect(screen.getByText('UX Review Staging')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'UX Review Staging' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { current: 'page', name: 'Deploy' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ux-review-staging/)).not.toBeInTheDocument();
  });

  it('gives the slug level the entity name past a level with no page', () => {
    mockRoutesByPath = {
      '/integrations': {},
      '/integrations/service-accounts': {},
      '/integrations/service-accounts/$serviceAccountSlug/tokens/new': {},
    };
    mockUseMatches.mockReturnValue([
      { pathname: '/', fullPath: '/', context: {} },
      { pathname: '/integrations', fullPath: '/integrations', context: {} },
      {
        pathname: '/integrations/service-accounts',
        fullPath: '/integrations/service-accounts',
        context: { getTitle: () => 'Service Accounts' },
      },
      {
        pathname: '/integrations/service-accounts/sdk/tokens/new/',
        fullPath: '/integrations/service-accounts/$serviceAccountSlug/tokens/new/',
        context: { getTitle: () => 'SDK runtime' },
      },
    ]);

    render(<PathBreadcrumbs />);

    expect(
      screen.getByRole('link', { name: 'Service Accounts' }),
    ).toHaveAttribute('href', '/integrations/service-accounts');
    expect(screen.getByText('SDK runtime')).toBeInTheDocument();
    expect(screen.getByText('Tokens')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Tokens' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { current: 'page', name: 'New' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('sdk')).not.toBeInTheDocument();
  });

  it('titles the tab "Page not found" when the API has no such entity', () => {
    mockRoutesByPath = { '/customers': {}, '/customers/$customerSlug': {} };
    mockUseMatches.mockReturnValue([
      { pathname: '/', fullPath: '/', context: {} },
      { pathname: '/customers', fullPath: '/customers', context: {} },
      {
        pathname: '/customers/does-not-exist',
        fullPath: '/customers/$customerSlug',
        status: 'error',
        error: new ApiError({ status: 404, data: null }),
        context: {},
      },
    ]);

    render(<PathBreadcrumbs />);

    expect(
      screen.getByRole('link', { current: 'page', name: 'does-not-exist' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Page not found · Kaiten');
  });

  it('keeps the title of the trail for a route that explains its own not-found', () => {
    mockRoutesByPath = { '/invoices': {}, '/invoices/$invoiceId': {} };
    mockUseMatches.mockReturnValue([
      { pathname: '/', fullPath: '/', context: {} },
      {
        pathname: '/invoices',
        fullPath: '/invoices',
        status: 'notFound',
        // What `notFound({ data })` threw: the route says why it has no screen.
        error: {
          data: { available: false, reason: 'DEPLOYMENT_DISABLED' },
          isNotFound: true,
        },
        context: {},
      },
      {
        pathname: '/invoices/inv-1',
        fullPath: '/invoices/$invoiceId',
        status: 'pending',
        context: {},
      },
    ]);

    render(<PathBreadcrumbs />);

    expect(document.title).toBe('inv-1 · Invoices · Kaiten');
  });

  it('still titles the tab "Page not found" for a not-found that explains nothing', () => {
    mockRoutesByPath = { '/invoices': {} };
    mockUseMatches.mockReturnValue([
      { pathname: '/', fullPath: '/', context: {} },
      {
        pathname: '/invoices',
        fullPath: '/invoices',
        status: 'notFound',
        error: { isNotFound: true },
        context: {},
      },
    ]);

    render(<PathBreadcrumbs />);

    expect(document.title).toBe('Page not found · Kaiten');
  });

  it('titles the tab "Page not found" for a URL no route answers', () => {
    mockLocationPathname = '/does/not/exist';
    mockUseMatches.mockReturnValue([
      { pathname: '/', fullPath: '/', context: {} },
    ]);

    render(<PathBreadcrumbs />);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(document.title).toBe('Page not found · Kaiten');
  });
});
