import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
};

function applyAttioStatus(isAttioConnected: boolean): ConnectorMeta[] {
  return CONNECTORS.map((connector) =>
    connector.id === 'attio'
      ? { ...connector, status: isAttioConnected ? 'connected' : 'available' }
      : connector,
  );
}

export function ConnectorsIndex({
  isAttioConnected,
  onConnectAttio,
  onOpenAttio,
}: ConnectorsIndexProps) {
  const { t } = useTranslation();
  const catalog = applyAttioStatus(isAttioConnected);
  const connected = catalog.filter((c) => c.status === 'connected');
  const crm = catalog.filter(
    (c) => c.group === 'CRM' && c.status !== 'connected',
  );
  const billing = catalog.filter(
    (c) => c.group === 'Billing' && c.status !== 'connected',
  );

  function primaryHandler(connector: ConnectorMeta) {
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
            {connector.tagline}
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
