import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ExternalLink, Loader2, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Page } from '@/functionals/page';
import { ConnectorTile, StatusBadge } from '../../components/connector-tile';
import { ATTIO_CONNECTOR } from '../../constants';
import { ATTIO_API_URL_DEFAULT } from '../constants';
import { useAttioSettingsMutations } from '../hooks';
import type { ConnectorSettings } from '../types';
import { AttioMappingEditorDialog } from './attio-mapping-editor-dialog';
import { AttioSyncedRecords } from './attio-synced-records';

const ATTIO_APP_URL = 'https://app.attio.com';

type AttioConnectorDetailProps = {
  attioSettings: ConnectorSettings | null;
  /** Called after a successful disconnect (route navigates back to the index). */
  onDisconnect: () => void;
};

export function AttioConnectorDetail({
  attioSettings,
  onDisconnect,
}: AttioConnectorDetailProps) {
  const { disconnect } = useAttioSettingsMutations();

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      onDisconnect();
    } catch {
      // Errors surface via the mutation's onError toast.
    }
  };

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <DetailPageHeader
        onDisconnect={handleDisconnect}
        isDisconnecting={disconnect.isPending}
      />
      <div className="mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        <ConfigurationSummary attioSettings={attioSettings} />
        <AttioSyncedRecords />
      </div>
    </Page>
  );
}

function DetailPageHeader({
  onDisconnect,
  isDisconnecting,
}: {
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Page.Header>
      <Page.Leading>
        <Page.Icon>
          <ConnectorTile connector={ATTIO_CONNECTOR} />
        </Page.Icon>
        <Page.Heading>
          <Page.TitleRow>
            <Page.Title>{ATTIO_CONNECTOR.name}</Page.Title>
            <StatusBadge status="connected" />
          </Page.TitleRow>
          <Page.Subtitle>
            {t('Pages.Integrations.Connectors.Detail.subtitle')}
          </Page.Subtitle>
        </Page.Heading>
      </Page.Leading>

      <Page.Actions>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={ATTIO_APP_URL} target="_blank" rel="noreferrer">
              <ExternalLink />
              {t('Pages.Integrations.Connectors.Detail.openInAttio')}
            </a>
          </Button>
          <DisconnectConfirmDialog
            onDisconnect={onDisconnect}
            isDisconnecting={isDisconnecting}
          />
        </div>
      </Page.Actions>
    </Page.Header>
  );
}

function DisconnectConfirmDialog({
  onDisconnect,
  isDisconnecting,
}: {
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive-subtle-foreground hover:bg-destructive-subtle hover:text-destructive-subtle-foreground"
          disabled={isDisconnecting}
        >
          {isDisconnecting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          {t('Pages.Integrations.Connectors.Detail.disconnect')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive-subtle text-destructive-subtle-foreground">
            <Trash2 className="size-5" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t('Pages.Integrations.Connectors.Detail.DisconnectDialog.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Pages.Integrations.Connectors.Detail.DisconnectDialog.description',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDisconnect}>
            {t(
              'Pages.Integrations.Connectors.Detail.DisconnectDialog.confirmButton',
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfigurationSummary({
  attioSettings,
}: {
  attioSettings: ConnectorSettings | null;
}) {
  const { t } = useTranslation();
  const settings = (attioSettings?.settings ?? {}) as Record<string, unknown>;
  const syncPolicy =
    typeof settings.syncPolicy === 'string' ? settings.syncPolicy : '—';
  const fieldsMapping = settings.fieldsMapping;
  const mappingsCount =
    fieldsMapping && typeof fieldsMapping === 'object'
      ? Object.keys(fieldsMapping).length
      : 0;
  const apiUrl =
    typeof settings.attioApiUrl === 'string'
      ? settings.attioApiUrl
      : ATTIO_API_URL_DEFAULT;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <ConfigItem
        label={t('Pages.Integrations.Connectors.Detail.Config.syncPolicy')}
        value={syncPolicy}
        mono
      />
      <ConfigItem
        label={t('Pages.Integrations.Connectors.Detail.Config.fieldMappings')}
        value={String(mappingsCount)}
        action={<AttioMappingEditorDialog attioSettings={attioSettings} />}
      />
      <ConfigItem
        label={t('Pages.Integrations.Connectors.Detail.Config.apiUrl')}
        value={apiUrl}
        mono
      />
    </div>
  );
}

function ConfigItem({
  label,
  value,
  mono,
  action,
}: {
  label: string;
  value: string;
  mono?: boolean;
  action?: ReactNode;
}) {
  return (
    <Card className="gap-1 py-3">
      <CardContent className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span
            className={cn(
              'truncate text-sm font-semibold',
              mono && 'font-mono',
            )}
            title={value}
          >
            {value}
          </span>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
