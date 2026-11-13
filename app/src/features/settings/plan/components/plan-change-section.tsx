import {
  CheckoutFlow,
  PricingTable,
  useUpgradeOptions,
} from '@kaitencloud/react-ui';
import { useTranslation } from 'react-i18next';

type PlanChangeSectionProps = {
  /** The slug of the plan being checked out, from the page's address. */
  selectedPlan?: string;
  onSelectPlan: (slug: string | undefined) => void;
};

/**
 * The plans the organization can move to, from Kaiten Cloud's public catalogue,
 * then the checkout of the one chosen: the card, when the plan needs one, and the
 * amount due before anything is confirmed. Absent when there is no other plan,
 * or no catalogue (no publishable key configured).
 *
 * The chosen plan lives in the address, so that a return from Stripe lands on
 * the same checkout and the SDK can carry it on.
 */
export function PlanChangeSection({
  selectedPlan,
  onSelectPlan,
}: PlanChangeSectionProps) {
  const { t } = useTranslation();
  const options = useUpgradeOptions();
  const plans = options.data ?? [];

  if (plans.length === 0) {
    return null;
  }

  const chosen = plans.find((plan) => plan.slug === selectedPlan);
  const here = `${window.location.origin}/settings/plan`;

  return (
    <section aria-labelledby="plan-change-title" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold" id="plan-change-title">
          {t('Pages.Settings.Plan.Change.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('Pages.Settings.Plan.Change.description')}
        </p>
      </div>
      {chosen ? (
        <CheckoutFlow
          onCancel={() => onSelectPlan(undefined)}
          onSubscribed={() => onSelectPlan(undefined)}
          plan={chosen}
          portalHref={here}
          returnUrl={`${here}?plan=${encodeURIComponent(chosen.slug)}`}
        />
      ) : (
        <PricingTable
          onSelectPlan={(slug) => onSelectPlan(slug)}
          plans={plans}
        />
      )}
    </section>
  );
}
