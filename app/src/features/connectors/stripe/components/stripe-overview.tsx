import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { STRIPE_KEY_PERMISSIONS } from '../constants';

const KAITEN_OWNS = [
  'catalogue',
  'entitlements',
  'usage',
  'subscription',
  'content',
] as const;
const STRIPE_OWNS = [
  'tax',
  'numbering',
  'presentation',
  'payment',
  'dunning',
] as const;

/**
 * The split this connector is about, which is the most misunderstood part of the
 * product: Kaiten composes what each customer owes, Stripe presents it, sends it
 * and collects it. Two short lists, and the permissions the key needs, so that
 * the key is created with no more and no less.
 */
export function StripeOverview() {
  const { t } = useTranslation();

  return (
    <div
      className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2"
      data-testid="stripe-overview"
    >
      <Card className="gap-3 py-4">
        <CardContent className="space-y-3">
          <h2 className="text-sm font-semibold">
            {t('Pages.Integrations.Connectors.Stripe.Split.title')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section>
              <h3 className="text-xs font-medium text-muted-foreground">
                {t('Pages.Integrations.Connectors.Stripe.Split.kaiten')}
              </h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                {KAITEN_OWNS.map((item) => (
                  <li key={item}>
                    {t(
                      `Pages.Integrations.Connectors.Stripe.Split.Kaiten.${item}`,
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="text-xs font-medium text-muted-foreground">
                {t('Pages.Integrations.Connectors.Stripe.Split.stripe')}
              </h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                {STRIPE_OWNS.map((item) => (
                  <li key={item}>
                    {t(
                      `Pages.Integrations.Connectors.Stripe.Split.Stripe.${item}`,
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </CardContent>
      </Card>
      <Card className="gap-3 py-4">
        <CardContent className="space-y-3">
          <h2 className="text-sm font-semibold">
            {t('Pages.Integrations.Connectors.Stripe.Permissions.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('Pages.Integrations.Connectors.Stripe.Permissions.description')}
          </p>
          <ul className="flex flex-wrap gap-2" data-testid="stripe-permissions">
            {STRIPE_KEY_PERMISSIONS.map(({ access, resource }) => (
              <li key={resource}>
                <Badge className="font-normal" variant="outline">
                  {t(
                    `Pages.Integrations.Connectors.Stripe.Permissions.${access}`,
                    { resource },
                  )}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
