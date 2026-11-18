import { useLicensingSnapshot } from '@kaitencloud/react';
import { fr } from '@kaitencloud/react/locales';
import {
  CustomerPortal,
  type CustomerPortalElement,
  KaitenProvider,
  KaitenStyleRoot,
  LicenseUsage,
} from '@kaitencloud/react-ui';
import '@kaitencloud/react-ui/styles.css';
import { useState } from 'react';
import env from '@/env';
import { getAppLocale } from '@/lib/app-locale';
import { createPlanSessionClient } from '../plan-session';
import type { PlanSession } from '../types';
import { PlanChangeSection } from './plan-change-section';

// The sections of a customer session's portal, in the order the SDK draws them, without
// `UsageMeters`: the meters keep to the quotas something caps, so a plan whose quotas are
// unlimited would show no usage at all. `LicenseUsage` lists every numeric quota, and sits
// between what the plan includes and what is paid, as the page's subtitle reads.
const INCLUDED_SECTIONS: CustomerPortalElement[] = [
  'CurrentPlan',
  'IncludedFeatures',
];
const PAYMENT_SECTIONS: CustomerPortalElement[] = [
  'AddOns',
  'PaymentMethodCard',
  'VoucherEntry',
  'InvoiceList',
];

type PlanPortalProps = {
  session: PlanSession;
  selectedPlan?: string;
  onSelectPlan: (slug: string | undefined) => void;
};

/**
 * What the plan includes, what it has used, and how it is paid, from the one portal
 * the provider reads. A portal that could not be read is one card with its retry, as
 * the SDK draws it, and not one for each of the three parts.
 */
function PlanOverview() {
  const snapshot = useLicensingSnapshot();

  if (snapshot.error && !snapshot.data) {
    return <CustomerPortal />;
  }

  return (
    <div className="flex flex-col gap-4">
      <CustomerPortal elements={INCLUDED_SECTIONS} />
      <LicenseUsage />
      <CustomerPortal elements={PAYMENT_SECTIONS} />
    </div>
  );
}

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
        {/* A gap, not `space-y-*`: the SDK's stylesheet resets the margins of its
            own elements outside any cascade layer, so it beats Tailwind's
            utilities and would put the plan change flush under the portal. */}
        <div className="flex flex-col gap-8">
          <PlanOverview />
          <PlanChangeSection
            onSelectPlan={onSelectPlan}
            selectedPlan={selectedPlan}
          />
        </div>
      </KaitenStyleRoot>
    </KaitenProvider>
  );
}
