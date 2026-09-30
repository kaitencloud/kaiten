import { AlertTriangle, ExternalLink, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DetailCard } from '@/functionals/detail-card';
import { getAttioSyncInfo } from '../logic';
import {
  type CrmSyncEntityKind,
  isAttioSyncCardVisible,
  useCrmSyncState,
} from '../queries/attio-sync-state';
import { AttioLogo } from './attio-logo';
import { SyncErrorDialog } from './sync-error-dialog';
import { formatSyncedAt, SyncStatusBadge } from './sync-status-badge';

type AttioSyncCardProps = {
  /** Picks the "Mapped Company" vs "Mapped Workspace" wording. */
  entityKind: CrmSyncEntityKind;
  entitySlug?: string;
  integrations: Record<string, unknown> | null | undefined;
  domain?: string | null;
};

/**
 * "Attio Synchronization" detail card. Surfaces linked and temporary
 * synchronization states, and stays hidden for an unlinked idle entity.
 */
export function AttioSyncCard({
  entityKind,
  entitySlug = '',
  integrations,
  domain,
}: AttioSyncCardProps) {
  const { t } = useTranslation();
  const syncInfo = getAttioSyncInfo(integrations);
  const syncState = useCrmSyncState({ entityKind, entitySlug });

  if (!isAttioSyncCardVisible(syncInfo, syncState)) {
    return null;
  }
  const pendingStatus = syncState.status === 'delayed' ? 'delayed' : 'pending';

  return (
    <DetailCard className="border-primary/30 bg-gradient-to-br from-background to-primary/5">
      <DetailCard.Header>
        <DetailCard.Title className="flex items-center gap-2 text-base">
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded bg-white shadow-sm ring-1 ring-black/10 dark:bg-black dark:ring-white/15"
            aria-hidden
          >
            <AttioLogo className="h-3.5 w-auto" />
          </span>
          {t('Pages.Integrations.Connectors.EntitySync.title')}
        </DetailCard.Title>
        <DetailCard.Description>
          {syncInfo
            ? entityKind === 'customer'
              ? t(
                  'Pages.Integrations.Connectors.EntitySync.customerDescription',
                )
              : t(
                  'Pages.Integrations.Connectors.EntitySync.instanceDescription',
                )
            : pendingStatus === 'pending'
              ? t('Pages.Integrations.Connectors.EntitySync.pendingDescription')
              : t(
                  'Pages.Integrations.Connectors.EntitySync.delayedDescription',
                )}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          {syncInfo && domain ? (
            <DetailCard.Row
              label={t('Pages.Integrations.Connectors.EntitySync.domain')}
              value={domain}
            />
          ) : null}
          <DetailCard.Row
            label={t('Pages.Integrations.Connectors.EntitySync.syncStatus')}
            value={
              syncState.status !== 'idle' ? (
                <PendingSyncStatus status={pendingStatus} />
              ) : syncInfo ? (
                syncInfo.lastError ? (
                  <SyncErrorDialog
                    error={syncInfo.lastError}
                    externalId={syncInfo.externalId}
                    syncedAt={syncInfo.syncedAt}
                  >
                    <SyncStatusBadge lastError={syncInfo.lastError} />
                  </SyncErrorDialog>
                ) : (
                  <SyncStatusBadge lastError={null} />
                )
              ) : null
            }
          />
          {syncInfo ? (
            <DetailCard.Row
              label={t('Pages.Integrations.Connectors.EntitySync.lastSynced')}
              value={formatSyncedAt(
                syncInfo.syncedAt,
                t('Pages.Integrations.Connectors.EntitySync.never'),
              )}
            />
          ) : null}
        </DetailCard.Rows>
        {syncInfo ? <CrmLinkRow webUrl={syncInfo.webUrl} /> : null}
      </DetailCard.Content>
    </DetailCard>
  );
}

function PendingSyncStatus({ status }: { status: 'pending' | 'delayed' }) {
  const { t } = useTranslation();
  if (status === 'delayed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-warning-subtle-foreground">
        <AlertTriangle className="size-3.5" aria-hidden />
        {t('Pages.Integrations.Connectors.EntitySync.statusDelayed')}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      {t('Pages.Integrations.Connectors.EntitySync.statusPendingShort')}
    </span>
  );
}

function CrmLinkRow({ webUrl }: { webUrl: string | null }) {
  const { t } = useTranslation();

  if (!webUrl) {
    return null;
  }

  return (
    <>
      <DetailCard.Divider />
      <DetailCard.Row
        label={t('Pages.Integrations.Connectors.EntitySync.viewInCrm')}
        value={
          <a
            href={webUrl}
            target="_blank"
            rel="noreferrer"
            title={webUrl}
            className="inline-flex items-center gap-1 text-primary-subtle-foreground hover:underline"
          >
            {t('Pages.Integrations.Connectors.EntitySync.openInAttio')}
            <ExternalLink className="size-3.5" />
          </a>
        }
      />
    </>
  );
}
