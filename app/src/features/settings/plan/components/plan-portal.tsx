import { fr } from '@kaitencloud/react/locales';
import {
  CustomerPortal,
  KaitenProvider,
  KaitenStyleRoot,
} from '@kaitencloud/react-ui';
import '@kaitencloud/react-ui/styles.css';
import { useState } from 'react';
import env from '@/env';
import { getAppLocale } from '@/lib/app-locale';
import { createPlanSessionClient } from '../plan-session';
import type { PlanSession } from '../types';
import { PlanChangeSection } from './plan-change-section';

type PlanPortalProps = {
  session: PlanSession;
  selectedPlan?: string;
  onSelectPlan: (slug: string | undefined) => void;
};

/**
 * The organization's own plan, drawn by Kaiten's React SDK in customer-session
 * mode: the console is a customer of Kaiten Cloud here, and reads its portal the
 * way any vendor's product reads its own customers' (V31-47). The session client
 * is built once for the page; it renews the session through saas-api.
 */
export function PlanPortal({
  session,
  selectedPlan,
  onSelectPlan,
}: PlanPortalProps) {
  const [sessionClient] = useState(() => createPlanSessionClient(session));
  const locale = getAppLocale().startsWith('fr') ? fr : undefined;

  return (
    <KaitenProvider
      apiUrl={env.PLATFORM_API_URL}
      locale={locale}
      mode="customer-session"
      publishableKey={env.PLATFORM_PUBLISHABLE_KEY || undefined}
      sessionClient={sessionClient}
    >
      <KaitenStyleRoot>
        <div className="space-y-8">
          <CustomerPortal />
          <PlanChangeSection
            onSelectPlan={onSelectPlan}
            selectedPlan={selectedPlan}
          />
        </div>
      </KaitenStyleRoot>
    </KaitenProvider>
  );
}
