import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProviderStanding } from '@/domains/billing';
import { Page } from '@/functionals/page';
import { cn } from '@/lib/utils';
import { ConnectorTile, StatusBadge } from '../../components/connector-tile';
import { STRIPE_CONNECTOR, stripeDashboardUrl } from '../constants';
import type { ReactNode } from 'react';

type StripeHeaderProps = {
  /** The button that disconnects it, once it is connected and the session may. */
  actions?: ReactNode;
  /** Where Stripe stands; none while that is not known yet. */
  standing: ProviderStanding | undefined;
};

/** Which account the connection reaches, in words, beside the badge that says it is connected. */
function ModeBadge({ livemode }: { livemode: boolean | undefined }) {
  const { t } = useTranslation();

  if (livemode === undefined) {
    return null;
  }

  return (
    <Badge
      className={cn(
        'font-normal',
        livemode &&
          'border-warning-subtle-foreground/30 bg-warning-subtle text-warning-subtle-foreground',
      )}
      data-mode={livemode ? 'live' : 'test'}
      variant="outline"
    >
      {t(
        livemode
          ? 'Pages.Integrations.Connectors.Stripe.Mode.live'
          : 'Pages.Integrations.Connectors.Stripe.Mode.test',
      )}
    </Badge>
  );
}

/**
 * The title of the Stripe page: the tile, whether it is connected and to which
 * account, what Kaiten and Stripe each do, and the actions of the session (a
 * link to the dashboard of that account, and the button that disconnects).
 */
export function StripeHeader({ actions, standing }: StripeHeaderProps) {
  const { t } = useTranslation();
  const connected = standing?.state === 'connected';
  const livemode =
    standing?.state === 'connected' ? standing.livemode : undefined;

  return (
    <Page.Header>
      <Page.Leading>
        <Page.Icon>
          <ConnectorTile connector={STRIPE_CONNECTOR} />
        </Page.Icon>
        <Page.Heading>
          <Page.TitleRow>
            <Page.Title>{STRIPE_CONNECTOR.name}</Page.Title>
            {standing ? (
              <StatusBadge
                status={
                  connected
                    ? 'connected'
                    : standing.state === 'available'
                      ? 'available'
                      : 'unavailable'
                }
              />
            ) : null}
            {connected ? <ModeBadge livemode={livemode} /> : null}
          </Page.TitleRow>
          <Page.Subtitle>
            {t('Pages.Integrations.Connectors.Stripe.subtitle')}
          </Page.Subtitle>
        </Page.Heading>
      </Page.Leading>
      {connected ? (
        <Page.Actions>
          <div className="flex items-center gap-2">
            <Button
              nativeButton={false}
              render={
                <a
                  href={stripeDashboardUrl(livemode)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ExternalLink />
                  {t('Pages.Integrations.Connectors.Stripe.openInStripe')}
                </a>
              }
              role="link"
              size="sm"
              variant="outline"
            />
            {actions}
          </div>
        </Page.Actions>
      ) : null}
    </Page.Header>
  );
}
