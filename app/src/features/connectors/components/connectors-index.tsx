import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { type ProviderStanding, useBillingProvider } from '@/domains/billing';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CONNECTORS } from '../constants';
import type { ConnectorMeta } from '../types';
import { ConnectorTile, StatusBadge } from './connector-tile';

type ConnectorsIndexProps = {
  isAttioConnected: boolean;
  onConnectAttio: () => void;
  onOpenAttio: () => void;
  onOpenStripe: () => void;
};

/**
 * Where Stripe stands, from the billing capabilities that list it: connected, free
 * to be, or not usable here, in which case the tile says why under its name. A
 * deployment whose API does not list it at all gets the generic reason. Until the
 * capabilities are in, the tile keeps its catalog entry rather than claim that
 * Stripe is unavailable for the length of a request.
 */
function getStripeStatus(
  standing: ProviderStanding | undefined,
): Pick<ConnectorMeta, 'note' | 'status'> {
  if (!standing) {
    return { status: 'available' };
  }
  switch (standing.state) {
    case 'connected':
      return { status: 'connected' };
    case 'available':
      return { status: 'available' };
    case 'unavailable':
      return {
        note: `Pages.Integrations.Connectors.Stripe.Unavailable.${standing.reason}.tile`,
        status: 'unavailable',
      };
    default:
      return {
        note: 'Pages.Integrations.Connectors.Stripe.Unavailable.UNKNOWN.tile',
        status: 'unavailable',
      };
  }
}

function applyStatuses(
  isAttioConnected: boolean,
  stripe: ProviderStanding | undefined,
): ConnectorMeta[] {
  return CONNECTORS.map((connector) => {
    if (connector.id === 'attio') {
      return {
        ...connector,
        status: isAttioConnected ? 'connected' : 'available',
      };
    }

    return connector.id === 'stripe'
      ? { ...connector, ...getStripeStatus(stripe) }
      : connector;
  });
}

export function ConnectorsIndex({
  isAttioConnected,
  onConnectAttio,
  onOpenAttio,
  onOpenStripe,
}: ConnectorsIndexProps) {
  const { t } = useTranslation();
  const { isPending, standing } = useBillingProvider('STRIPE');
  const catalog = applyStatuses(
    isAttioConnected,
    isPending ? undefined : standing,
  );
  const connected = catalog.filter((c) => c.status === 'connected');
  const crm = catalog.filter(
    (c) => c.group === 'CRM' && c.status !== 'connected',
  );
  const billing = catalog.filter(
    (c) => c.group === 'Billing' && c.status !== 'connected',
  );

  function primaryHandler(connector: ConnectorMeta) {
    if (connector.id === 'stripe') {
      return connector.status === 'unavailable' ? undefined : onOpenStripe;
    }
    if (connector.id !== 'attio') {
      return undefined;
    }
    return connector.status === 'connected' ? onOpenAttio : onConnectAttio;
  }

  function renderCard(connector: ConnectorMeta) {
    const isConnected = connector.status === 'connected';
    return (
      <ConnectorCard
        key={connector.id}
        connector={connector}
        onPrimary={primaryHandler(connector)}
        primaryLabel={
          isConnected
            ? t('Pages.Integrations.Connectors.Card.manage')
            : t('Pages.Integrations.Connectors.Card.connect')
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ConnectorSection
        title={t('Pages.Integrations.Connectors.Sections.connected', {
          count: connected.length,
        })}
      >
        {connected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Integrations.Connectors.Sections.noConnectors')}
          </p>
        ) : (
          <ConnectorGrid>{connected.map(renderCard)}</ConnectorGrid>
        )}
      </ConnectorSection>

      <ConnectorSection title={t('Pages.Integrations.Connectors.Sections.crm')}>
        <ConnectorGrid>{crm.map(renderCard)}</ConnectorGrid>
      </ConnectorSection>

      <ConnectorSection
        title={t('Pages.Integrations.Connectors.Sections.billing')}
      >
        <ConnectorGrid>{billing.map(renderCard)}</ConnectorGrid>
      </ConnectorSection>
    </div>
  );
}

function ConnectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function ConnectorGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

type ConnectorCardProps = {
  connector: ConnectorMeta;
  onPrimary?: () => void;
  primaryLabel: string;
};

function ConnectorCard({
  connector,
  onPrimary,
  primaryLabel,
}: ConnectorCardProps) {
  const { t } = useTranslation();
  const disabled = !onPrimary;
  return (
    <Card className="h-full gap-3 py-4">
      <div className="flex items-start gap-3 px-4">
        <ConnectorTile connector={connector} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold leading-none">
            {connector.name}
          </span>
          <span className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
            {connector.note ? t(connector.note) : connector.tagline}
          </span>
        </div>
        <StatusBadge status={connector.status} />
      </div>
      <CardContent className="mt-auto px-4">
        <Button
          variant={connector.status === 'connected' ? 'outline' : 'default'}
          size="sm"
          className="w-full"
          disabled={disabled}
          onClick={onPrimary}
        >
          {primaryLabel}
          {!disabled && <ArrowRight />}
        </Button>
      </CardContent>
    </Card>
  );
}
