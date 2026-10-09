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

// One route, told apart by its search: every invoice is the bare path.
const SEARCH_TABS: RouteTab[] = [
  { id: 'all', label: 'All', to: '/invoices' },
  {
    id: 'handoff',
    label: 'Handoff',
    search: { view: 'handoff' },
    to: '/invoices',
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
    renderTabs('/invoices', '/invoices', SEARCH_TABS);

    expect(await screen.findByRole('link', { name: 'All' })).toHaveAttribute(
      'href',
      '/invoices',
    );
    expect(screen.getByRole('link', { name: 'Handoff' })).toHaveAttribute(
      'href',
      '/invoices?view=handoff',
    );
  });

  it('open on the tab that has no search, and only that one is active', async () => {
    renderTabs('/invoices', '/invoices', SEARCH_TABS);

    await screen.findByRole('link', { name: 'All' });

    expect(isActive('All')).toBe(true);
    expect(isActive('Handoff')).toBe(false);
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Handoff' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('make the tab whose search the page carries the active one, and it alone', async () => {
    renderTabs(
      '/invoices?view=handoff',
      '/invoices',
      SEARCH_TABS,
    );

    await screen.findByRole('link', { name: 'Handoff' });

    expect(isActive('Handoff')).toBe(true);
    expect(isActive('All')).toBe(false);
    expect(screen.getByRole('link', { name: 'Handoff' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'All' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('say the tab that has no search is the current one when the page carries a search that tab does not name', async () => {
    // A link written by hand may spell out what the route opens on. The tab is still the
    // one the page is on, and a screen reader is told so as well as the eye.
    renderTabs(
      '/invoices?view=all',
      '/invoices',
      SEARCH_TABS,
    );

    await screen.findByRole('link', { name: 'All' });

    expect(isActive('All')).toBe(true);
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Handoff' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('follow the person from one to the other', async () => {
    renderTabs('/invoices', '/invoices', SEARCH_TABS);

    await userEvent.click(await screen.findByRole('link', { name: 'Handoff' }));

    await expect.poll(() => isActive('Handoff')).toBe(true);
    expect(isActive('All')).toBe(false);

    await userEvent.click(screen.getByRole('link', { name: 'All' }));

    await expect.poll(() => isActive('All')).toBe(true);
    expect(isActive('Handoff')).toBe(false);
  });
});
