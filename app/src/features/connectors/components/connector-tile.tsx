import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConnectorMeta, ConnectorStatus } from '../types';

const TILE_CLASS: Record<ConnectorMeta['tile'], string> = {
  primary: 'bg-primary-subtle text-primary-subtle-foreground',
  accent: 'bg-accent text-accent-foreground',
  muted: 'bg-muted text-muted-foreground',
  success: 'bg-success-subtle text-success-subtle-foreground',
  warning: 'bg-warning-subtle text-warning-subtle-foreground',
};

export function ConnectorTile({ connector }: { connector: ConnectorMeta }) {
  const logo = connector.logo;

  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg font-semibold',
        logo
          ? 'bg-white shadow-sm ring-1 ring-black/10 dark:bg-black dark:ring-white/15'
          : TILE_CLASS[connector.tile],
      )}
      aria-hidden
    >
      {logo ? (
        <>
          <img
            src={logo.light}
            alt=""
            aria-hidden
            className="block h-5 w-auto dark:hidden"
          />
          <img
            src={logo.dark}
            alt=""
            aria-hidden
            className="hidden h-5 w-auto dark:block"
          />
        </>
      ) : (
        connector.initial
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: ConnectorStatus }) {
  const { t } = useTranslation();

  if (status === 'connected') {
    return (
      <Badge className="gap-1 border-success-subtle-foreground/30 bg-success-subtle text-success-subtle-foreground">
        <CheckCircle2 className="size-3" />
        {t('Pages.Integrations.Connectors.Status.connected')}
      </Badge>
    );
  }

  if (status === 'available') {
    return (
      <Badge variant="secondary">
        {t('Pages.Integrations.Connectors.Status.available')}
      </Badge>
    );
  }

  if (status === 'coming-h1') {
    return (
      <Badge variant="outline">
        {t('Pages.Integrations.Connectors.Status.comingH1')}
      </Badge>
    );
  }

  return (
    <Badge variant="outline">
      {t('Pages.Integrations.Connectors.Status.comingH2')}
    </Badge>
  );
}
