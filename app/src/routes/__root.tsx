import { OrganizationSwitcher, UserButton } from '@clerk/react';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { DevAuthSwitcher } from '@/components/dev-auth-switcher';
import { NotificationBell } from '@/features/notifications';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useDemoSandboxEnabled } from '@/hooks/use-feature-flag';
import { useIsSideNavLocked } from './-components/side-nav/use-sidenav-lock';
import { PathBreadcrumbs } from './-components/path-breadcrumbs';
import { SideNav } from './-components/side-nav/side-nav';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootLayout,
});

const isLocalAuth = import.meta.env.VITE_LOCAL_AUTH === 'true';

// Lazy so the demo-sandbox module is only downloaded by an organization the
// `demo-sandbox` platform flag marks as a sandbox — decided at runtime, since
// the same image serves demo and regular tenants alike.
const DemoBanner = lazy(() =>
  import('@/features/demo-sandbox').then((m) => ({
    default: m.DemoBanner,
  })),
);

function RootLayout() {
  const showClerkControls =
    !isLocalAuth && import.meta.env.VITE_E2E_BYPASS_AUTH !== 'true';
  const {
    settings: { sideNavExpanded },
    setSideNavExpanded,
  } = useAppSettings();
  // Past a certain width collapsing the nav no longer widens the (max-width
  // capped) content — it would just re-center it and open an empty gap — so the
  // nav is locked open and its toggle hidden.
  const isSideNavLocked = useIsSideNavLocked();
  const demoSandboxEnabled = useDemoSandboxEnabled();

  return (
    <SidebarProvider
      open={isSideNavLocked ? true : sideNavExpanded}
      onOpenChange={isSideNavLocked ? undefined : setSideNavExpanded}
      className="antialiased visible! opacity-100! transition-opacity duration-150 bg-app-background! h-screen min-h-0"
      style={
        {
          '--sidebar-width': '10rem',
          '--sidebar-width-icon': '4rem',
        } as React.CSSProperties
      }
    >
      <SideNav />
      <SidebarInset className="bg-transparent! min-w-0">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-screen-2xl flex-col pb-4">
          {demoSandboxEnabled && (
            <Suspense fallback={null}>
              <DemoBanner />
            </Suspense>
          )}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:border-0 md:bg-transparent sm:px-6">
            {!isSideNavLocked && (
              <SidebarTrigger className="-ml-1 cursor-pointer" />
            )}
            <PathBreadcrumbs />
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <NotificationBell />
              <AnimatedThemeToggler className="cursor-pointer inline-flex items-center justify-center size-9 rounded-md hover:bg-accent hover:text-foreground" />
              {showClerkControls && (
                <>
                  <div className="hidden sm:block">
                    <OrganizationSwitcher hidePersonal />
                  </div>
                  <UserButton />
                </>
              )}
              {isLocalAuth && <DevAuthSwitcher />}
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </SidebarInset>
      {/*       <TanStackRouterDevtools />
      <ReactQueryDevtools /> */}
      <Toaster />
    </SidebarProvider>
  );
}
