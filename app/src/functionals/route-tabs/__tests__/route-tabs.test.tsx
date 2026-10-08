import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { type RouteTab, RouteTabs } from '../route-tabs';

const PATH_TABS: RouteTab[] = [
  { id: 'customers', label: 'Customers', to: '/customers' },
  { id: 'instances', label: 'Instances', to: '/customers/instances' },
];

// One route, told apart by its search: what waits is the bare path.
const SEARCH_TABS: RouteTab[] = [
  { id: 'pending', label: 'Waiting', to: '/billing/handoff' },
  {
    id: 'acknowledged',
    label: 'Acknowledged',
    search: { status: 'ACKNOWLEDGED' },
    to: '/billing/handoff',
  },
];

function renderTabs(initialEntry: string, routePath: string, tabs: RouteTab[]) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StorybookRouter initialEntries={[initialEntry]} routePath={routePath}>
        <RouteTabs tabs={tabs} />
      </StorybookRouter>
    </QueryClientProvider>,
  );
}

// The tab that is drawn as the one the person is on.
const isActive = (name: string) =>
  screen.getByRole('link', { name }).classList.contains('bg-background');

describe('the tabs of a route', () => {
  it('make the tab of the path the page is on the active one', async () => {
    renderTabs('/customers', '/customers', PATH_TABS);

    await screen.findByRole('link', { name: 'Customers' });

    expect(isActive('Customers')).toBe(true);
    expect(isActive('Instances')).toBe(false);
  });

  it('keep the tab of a page that is under another path active, the longest path winning', async () => {
    renderTabs(
      '/customers/instances/acme-production',
      '/customers/instances/$instanceSlug',
      PATH_TABS,
    );

    await screen.findByRole('link', { name: 'Instances' });

    expect(isActive('Instances')).toBe(true);
    expect(isActive('Customers')).toBe(false);
  });
});

describe('the tab that is marked as the current one', () => {
  it('is the one of the page, and only that one, where a tab is the parent path of another', async () => {
    renderTabs(
      '/customers/instances/acme-production',
      '/customers/instances/$instanceSlug',
      PATH_TABS,
    );

    await screen.findByRole('link', { name: 'Instances' });

    expect(screen.getByRole('link', { name: 'Instances' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Customers' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});

describe('the tabs of one route told apart by its search', () => {
  it('lead each to its own search, and what the route opens on is the bare path', async () => {
    renderTabs('/billing/handoff', '/billing/handoff', SEARCH_TABS);

    expect(await screen.findByRole('link', { name: 'Waiting' })).toHaveAttribute(
      'href',
      '/billing/handoff',
    );
    expect(screen.getByRole('link', { name: 'Acknowledged' })).toHaveAttribute(
      'href',
      '/billing/handoff?status=ACKNOWLEDGED',
    );
  });

  it('open on the tab that has no search, and only that one is active', async () => {
    renderTabs('/billing/handoff', '/billing/handoff', SEARCH_TABS);

    await screen.findByRole('link', { name: 'Waiting' });

    expect(isActive('Waiting')).toBe(true);
    expect(isActive('Acknowledged')).toBe(false);
    expect(screen.getByRole('link', { name: 'Waiting' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Acknowledged' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('make the tab whose search the page carries the active one, and it alone', async () => {
    renderTabs(
      '/billing/handoff?status=ACKNOWLEDGED',
      '/billing/handoff',
      SEARCH_TABS,
    );

    await screen.findByRole('link', { name: 'Acknowledged' });

    expect(isActive('Acknowledged')).toBe(true);
    expect(isActive('Waiting')).toBe(false);
    expect(screen.getByRole('link', { name: 'Acknowledged' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Waiting' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('say the tab that has no search is the current one when the page carries a search that tab does not name', async () => {
    // A link written by hand may spell out what the route opens on. The tab is still the
    // one the page is on, and a screen reader is told so as well as the eye.
    renderTabs(
      '/billing/handoff?status=PENDING',
      '/billing/handoff',
      SEARCH_TABS,
    );

    await screen.findByRole('link', { name: 'Waiting' });

    expect(isActive('Waiting')).toBe(true);
    expect(screen.getByRole('link', { name: 'Waiting' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Acknowledged' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('follow the person from one to the other', async () => {
    renderTabs('/billing/handoff', '/billing/handoff', SEARCH_TABS);

    await userEvent.click(await screen.findByRole('link', { name: 'Acknowledged' }));

    await expect.poll(() => isActive('Acknowledged')).toBe(true);
    expect(isActive('Waiting')).toBe(false);

    await userEvent.click(screen.getByRole('link', { name: 'Waiting' }));

    await expect.poll(() => isActive('Waiting')).toBe(true);
    expect(isActive('Acknowledged')).toBe(false);
  });
});
