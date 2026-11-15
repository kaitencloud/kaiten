import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { E2EMswConfig } from '../e2e/app/_support/contracts/msw-slots';

import '@/lib/i18n/config';
import '@/lib/api/bootstrap';
import { subscribeAiAccess } from '@/domains/ai-credits';

// Import the generated route tree after API setup so route-level query
// options capture the configured REST base URL.
import { routeTree } from './routeTree.gen';

import './styles.css';
import { useAuth } from '@clerk/react';
import { ClerkGate } from './components/clerk-gate';
import { LocalAuthGate } from './components/dev-auth-switcher';
import { RouteError } from './components/route';
import { NotFound } from './components/route/not-found';
import { RoutePending } from './components/route/route-pending';
import { ThemeProvider } from './components/theme-provider';
import { TooltipProvider } from './components/ui/tooltip';
import { trackLastUsedControl } from './lib/dialog-opener';
import { usePruneFormRecoveryAtStartup } from './hooks/use-form-recovery-startup';
import { pruneFormRecoveryAtStartup } from './lib/form-recovery';
import { subscribeFeatureFlagRefresh } from './lib/feature-flags';
import { syncSessionCookie } from './lib/local-auth';
import { getSessionIdentity } from './lib/session-identity';
import reportWebVitals from './report-web-vitals';

const bypassAuthForE2E = import.meta.env.VITE_E2E_BYPASS_AUTH === 'true';
const useMswForE2E = import.meta.env.VITE_E2E_MSW === 'true';
const useLocalAuth = import.meta.env.VITE_LOCAL_AUTH === 'true';
const useNotificationsMock = import.meta.env.VITE_MOCK_NOTIFICATIONS === 'true';
const useApiMocks = import.meta.env.VITE_MOCK_API === 'true';

type E2EWindow = Window & {
  __KAITEN_E2E_MSW__?: E2EMswConfig;
};

const createAppRouter = (queryClient: QueryClient) =>
  createRouter({
    routeTree,
    context: {
      queryClient,
    },
    defaultErrorComponent: ({ error }) => <RouteError error={error} />,
    defaultNotFoundComponent: () => <NotFound />,
    defaultPendingComponent: () => <RoutePending />,
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
  });

type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}

function RoutedApp() {
  // 30s of freshness: route loaders `ensureQueryData` right before the
  // component mounts its `useSuspenseQuery`; without a staleTime every
  // navigation fetched twice. Mutations refresh through invalidateQueries.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000 } },
      }),
  );
  const [router] = useState(() => createAppRouter(queryClient));

  // Toggling one of the flags this app gates its own features on, from the
  // feature-flags page, must show up here: nothing else re-reads the
  // OpenFeature provider's initialization-time cache.
  useEffect(() => subscribeFeatureFlagRefresh(queryClient), [queryClient]);
  useEffect(() => subscribeAiAccess(queryClient), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AuthenticatedApp() {
  const { orgId, userId } = useAuth();

  // Once the person is known: drop what expired and what another user left.
  usePruneFormRecoveryAtStartup();

  return (
    <RoutedApp key={`${userId ?? 'no-user'}/${orgId ?? 'no-organization'}`} />
  );
}

async function prepareE2EMockServiceWorker() {
  if (!useMswForE2E) {
    return;
  }

  const config = (window as E2EWindow).__KAITEN_E2E_MSW__;

  if (!config) {
    return;
  }

  const { startE2EMockServiceWorker } = await import('./e2e/msw/browser');
  await startE2EMockServiceWorker(config);
}

// Serves the whole API from MSW, for front-end work without a stack
// (`pnpm run dev:mock`).
async function prepareApiDevMocks() {
  if (!useApiMocks || useMswForE2E) {
    return;
  }

  const { startDevMocks } = await import('./e2e/msw/dev');
  await startDevMocks();
}

// Serves the notifications contract from MSW while everything else hits the real
// API. The backend exists now (api/internal/modules/notifications), so this is
// for working on the UI without a stack rather than for want of a server.
async function prepareNotificationsDevMocks() {
  if (!useNotificationsMock || useMswForE2E || useApiMocks) {
    return;
  }

  const { startNotificationsDevMocks } =
    await import('./e2e/msw/notifications-dev-seed');
  await startNotificationsDevMocks();
}

async function bootstrapApp() {
  // The notification stream authenticates with a cookie, because EventSource
  // cannot send a header; locally that cookie is mirrored from the dev token,
  // and a tab opened after the token was chosen has to re-write it. See
  // lib/local-auth.
  if (useLocalAuth) {
    syncSessionCookie();
  }

  // A dialog gives the focus back to the control that opened it, which a route dialog's link
  // is not any more once the page was drawn again: noted from the first click on.
  trackLastUsedControl();

  // Accounts without a provider know who they are at once; Clerk's do it in
  // AuthenticatedApp, when the session is there.
  if (useLocalAuth || bypassAuthForE2E) {
    void pruneFormRecoveryAtStartup(getSessionIdentity());
  }

  await prepareE2EMockServiceWorker();
  await prepareApiDevMocks();
  await prepareNotificationsDevMocks();

  const rootElement = document.getElementById('app');

  if (!rootElement || rootElement.innerHTML) {
    return;
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <ThemeProvider>
        {useLocalAuth ? (
          <LocalAuthGate>
            <RoutedApp />
          </LocalAuthGate>
        ) : bypassAuthForE2E ? (
          <RoutedApp />
        ) : (
          <ClerkGate>
            <AuthenticatedApp />
          </ClerkGate>
        )}
      </ThemeProvider>
    </StrictMode>,
  );

  reportWebVitals();
}

void bootstrapApp();
