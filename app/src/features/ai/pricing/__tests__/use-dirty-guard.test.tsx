import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { dropsRuleForm, useDirtyGuard } from '../use-dirty-guard';

/** The guard on a page of a real router, with what it says and its three verbs. */
function Probe() {
  const guard = useDirtyGuard();

  return (
    <div>
      <p data-testid="asking">{String(guard.asking)}</p>
      <button onClick={() => guard.setDirty(true)} type="button">
        dirty
      </button>
      <button onClick={guard.confirm} type="button">
        confirm
      </button>
      <button onClick={guard.cancel} type="button">
        cancel
      </button>
    </div>
  );
}

/**
 * `browser`: the history of the window, which is the one that hears the
 * browser's Back and the closing of the tab. A memory history hears neither.
 */
function renderGuard(kind: 'browser' | 'memory' = 'memory') {
  const root = createRootRoute({ component: () => <Outlet /> });
  const pricing = createRoute({
    component: Probe,
    getParentRoute: () => root,
    path: '/ai/pricing',
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const models = createRoute({
    component: () => <p>models page</p>,
    getParentRoute: () => root,
    path: '/ai/models',
  });
  if (kind === 'browser') {
    window.history.replaceState(null, '', '/ai/models');
    window.history.pushState(null, '', '/ai/pricing?cell=pro~gpt-5');
  }
  const history =
    kind === 'browser'
      ? createBrowserHistory()
      : createMemoryHistory({
          initialEntries: ['/ai/models', '/ai/pricing?cell=pro~gpt-5'],
          initialIndex: 1,
        });
  const router = createRouter({
    history,
    routeTree: root.addChildren([pricing, models]),
  });
  render(<RouterProvider router={router} />);

  return { history, router };
}

const asking = () => screen.getByTestId('asking').textContent;
const click = (name: string) => act(() => screen.getByRole('button', { name }).click());

describe('dropsRuleForm', () => {
  const at = (search: Record<string, unknown>, pathname = '/ai/pricing') => ({ pathname, search });

  it('is true for another page, cell, pool, request type or family', () => {
    const open = at({ cell: 'pro~gpt-5', pool: 'credits' });

    expect(dropsRuleForm(open, at({}, '/ai/models'))).toBe(true);
    expect(dropsRuleForm(open, at({ cell: 'pro~*', pool: 'credits' }))).toBe(true);
    expect(dropsRuleForm(open, at({ pool: 'credits' }))).toBe(true);
    expect(dropsRuleForm(open, at({ cell: 'pro~gpt-5', pool: 'other' }))).toBe(true);
    expect(dropsRuleForm(open, at({ cell: 'pro~gpt-5', pool: 'credits', type: 'EMBEDDING' }))).toBe(true);
    expect(dropsRuleForm(open, at({ cell: 'pro~gpt-5', pool: 'credits', family: 'pro' }))).toBe(true);
  });

  it('is false for what keeps the form: the search box and the status filter', () => {
    const open = at({ cell: 'pro~gpt-5', pool: 'credits' });

    expect(dropsRuleForm(open, at({ cell: 'pro~gpt-5', pool: 'credits', q: 'gpt', status: 'all' }))).toBe(false);
  });
});

describe('useDirtyGuard on a router', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('lets a navigation through while nothing is unsent', async () => {
    const { router } = renderGuard();
    await screen.findByTestId('asking');

    await act(() => router.navigate({ to: '/ai/models' }));

    expect(await screen.findByText('models page')).toBeInTheDocument();
  });

  it('stops a link to another page while changes are unsent, and asks', async () => {
    const { router } = renderGuard();
    await screen.findByTestId('asking');
    await click('dirty');

    void act(() => {
      void router.navigate({ to: '/ai/models' });
    });

    await waitFor(() => expect(asking()).toBe('true'));
    expect(router.state.location.pathname).toBe('/ai/pricing');

    // Keep editing: the navigation is dropped, the page stays.
    await click('cancel');
    await waitFor(() => expect(asking()).toBe('false'));
    expect(router.state.location.pathname).toBe('/ai/pricing');
  });

  it('stops the browser’s Back, and leaves once the person confirms', async () => {
    const { router } = renderGuard('browser');
    await screen.findByTestId('asking');
    await click('dirty');

    act(() => window.history.back());

    await waitFor(() => expect(asking()).toBe('true'));
    expect(router.state.location.pathname).toBe('/ai/pricing');
    await click('confirm');
    expect(await screen.findByText('models page')).toBeInTheDocument();
  });

  it('does not stop a change of the search box', async () => {
    const { router } = renderGuard();
    await screen.findByTestId('asking');
    await click('dirty');

    await act(() =>
      router.navigate({ search: { cell: 'pro~gpt-5', q: 'gpt' }, to: '/ai/pricing' }),
    );

    expect(asking()).toBe('false');
    expect(router.state.location.search).toMatchObject({ q: 'gpt' });
  });

  it('asks the browser’s own question on tab close only while changes are unsent', async () => {
    renderGuard('browser');
    await screen.findByTestId('asking');
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      return event.defaultPrevented;
    };

    expect(unload()).toBe(false);
    await click('dirty');
    expect(unload()).toBe(true);
  });
});
