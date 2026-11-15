import { createFileRoute } from '@tanstack/react-router';
import { PricingPage, readPricingSearch } from '@/features/ai';
import i18n from '@/lib/i18n/config';

// `?pool=&family=&version=&type=&q=&status=&cell=`: the view of the rate card and
// the cell whose panel is open, so that a link opens the same price and a reload
// keeps it. The `/ai` route guards the whole area.
export const Route = createFileRoute('/ai/pricing/')({
  validateSearch: (search) => readPricingSearch(search),
  beforeLoad: () => ({ getTitle: () => i18n.t('AI.Pricing.title') }),
  component: PricingRoute,
});

function PricingRoute() {
  return <PricingPage search={Route.useSearch()} />;
}
