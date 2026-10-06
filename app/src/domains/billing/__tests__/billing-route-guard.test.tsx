import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import en from '@/lib/i18n/locales/en';
import { logger } from '@/lib/logger';
import { billingCapabilitiesProfiles } from '../../../../e2e/app/_support/model/billing-capabilities';
import { BillingNotFound } from '../components';
import { requireBillingCapability } from '../queries';

// A guarded billing route as the console builds one, with a screen below it that
// loads data, which is what the guard must keep from loading where billing is
// not there. The guard is the one of `routes/billing/route.tsx`.
beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

beforeEach(() => {
  // jsdom has no scrolling, which the router asks for on every navigation.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const answer = (capabilities = billingCapabilitiesProfiles.stack()) =>
  server.use(handleGetBillingCapabilities({ body: capabilities }));

const refuse = (status: number, code: string, detail: string) =>
  server.use(
    handleGetBillingCapabilities(() =>
      HttpResponse.json(
        { code, detail, status, title: 'Error' },
        { headers: { 'Content-Type': 'application/problem+json' }, status },
      ),
    ),
  );

function mount(path: string) {
  const screenBeforeLoad = vi.fn(async () => ({}));
  const screenLoader = vi.fn(async () => 'invoices');
  const queryClient = new QueryClient();
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: Outlet,
  });
  const billing = createRoute({
    beforeLoad: async ({ context }) => {
      await requireBillingCapability(context.queryClient);
    },
    component: function BillingLayout() {
      return (
        <div data-testid="billing-layout">
          <Outlet />
        </div>
      );
    },
    getParentRoute: () => root,
    notFoundComponent: BillingNotFound,
    path: 'billing',
  });
  const invoices = createRoute({
    beforeLoad: screenBeforeLoad,
    component: () => <p>The invoices</p>,
    getParentRoute: () => billing,
    loader: screenLoader,
    path: 'invoices',
  });
  const router = createRouter({
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: root.addChildren([billing.addChildren([invoices])]),
  });

  render(<RouterProvider router={router} />);

  return { router, screenBeforeLoad, screenLoader };
}

describe('the guard of a billing route', () => {
  it('lets the screens below it load and render where billing is on', async () => {
    answer();
    const { screenLoader } = mount('/billing/invoices');

    expect(await screen.findByText('The invoices')).toBeInTheDocument();

    expect(screenLoader).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('billing-unavailable')).toBeNull();
  });

  it.each([
    ['DEPLOYMENT_DISABLED', 'Billing is not enabled'],
    ['NOT_ENTITLED', 'Billing is not part of your plan'],
  ] as const)(
    'explains, and loads nothing below it, where billing is off: %s',
    async (reason, title) => {
      answer(billingCapabilitiesProfiles.disabled(reason));
      const { screenBeforeLoad, screenLoader } = mount('/billing/invoices');

      expect(await screen.findByText(title)).toBeInTheDocument();

      // A screen under a closed gate must not ask the API for what is not there.
      expect(screenBeforeLoad).not.toHaveBeenCalled();
      expect(screenLoader).not.toHaveBeenCalled();
      expect(screen.queryByText('The invoices')).toBeNull();
      expect(screen.queryByTestId('billing-layout')).toBeNull();
      expect(screen.getByTestId('billing-unavailable')).toHaveAttribute(
        'data-reason',
        reason,
      );
      // An explanation, not an error and not a missing page.
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Page not found')).toBeNull();
    },
  );

  it('names the scope the session lacks when the capabilities are refused', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    refuse(403, 'Auth.MissingScope', 'missing required scope: read:billing');
    const { screenLoader } = mount('/billing/invoices');

    expect(
      await screen.findByText('You do not have access to billing'),
    ).toBeInTheDocument();

    expect(screen.getByText('read:billing')).toBeInTheDocument();
    expect(screenLoader).not.toHaveBeenCalled();
  });

  it('explains too for a path under it that is no page', async () => {
    answer(billingCapabilitiesProfiles.disabled('DEPLOYMENT_DISABLED'));
    mount('/billing/nowhere');

    expect(await screen.findByText('Billing is not enabled')).toBeInTheDocument();
    expect(screen.queryByText('Page not found')).toBeNull();
  });

  it('says a path under it is no page where billing is on', async () => {
    answer();
    mount('/billing/nowhere');

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.queryByTestId('billing-unavailable')).toBeNull();
  });

  it('runs again, and opens the screens, when asked to read the capabilities again', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const user = userEvent.setup();
    refuse(503, 'Billing.EntitlementCheckUnavailable', 'down');
    const { screenLoader } = mount('/billing/invoices');

    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screenLoader).not.toHaveBeenCalled();

    // Billing is back by the time the person asks again.
    answer();
    await user.click(retry);

    expect(await screen.findByText('The invoices')).toBeInTheDocument();
    expect(screenLoader).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('billing-unavailable')).toBeNull();
  });
});
