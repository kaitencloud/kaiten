import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { SettingsPageContent } from '@/features/settings';
import { useDemoSandboxEnabled } from '@/hooks/use-feature-flag';
import i18n from '@/lib/i18n/config';

// Lazy and flag-gated at runtime — see routes/__root.tsx for why.
const DemoSettingsCard = lazy(() =>
  import('@/features/demo-sandbox').then((m) => ({
    default: m.DemoSettingsCard,
  })),
);

// Composed here, not inside the settings feature itself: features may not
// import one another (see `check:architecture`), so cross-feature sections
// are assembled at the route level instead.
function SettingsRouteComponent() {
  const demoSandboxEnabled = useDemoSandboxEnabled();

  return (
    <SettingsPageContent>
      {demoSandboxEnabled && (
        <Suspense fallback={null}>
          <DemoSettingsCard />
        </Suspense>
      )}
    </SettingsPageContent>
  );
}

export const Route = createFileRoute('/settings/')({
  component: SettingsRouteComponent,
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Settings.title', 'Settings'),
  }),
});
