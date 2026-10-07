import { createFileRoute } from '@tanstack/react-router';
import {
  billingSettingsQueryOptions,
  BillingNotFound,
  requireBillingCapability,
} from '@/domains/billing';
import { BillingSettingsPageContent } from '@/features/settings';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/settings/billing')({
  component: BillingSettingsPageContent,
  // Shown in place of the page where billing is not there, so that a link to it
  // explains why instead of failing.
  notFoundComponent: BillingNotFound,
  // Where billing is not there it throws before the loader, and nothing of billing
  // is requested but the capabilities.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient);

    return {
      getTitle: () => i18n.t('Pages.Settings.Billing.title'),
    };
  },
  // The defaults are read by the page, which shows a refusal with a way to ask
  // again: a loader that threw would blank the page instead.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(billingSettingsQueryOptions);
  },
});
