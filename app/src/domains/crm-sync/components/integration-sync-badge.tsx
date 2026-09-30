import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type AttioSyncInfo, getAttioSyncInfo } from '../logic';
import {
  type CrmSyncEntityKind,
  type CrmSyncStatus,
  useCrmSyncState,
} from '../queries/attio-sync-state';
import { AttioLogo } from './attio-logo';
import { SyncErrorDialogContent } from './sync-error-dialog';
import { formatSyncedAt } from './sync-status-badge';

type IntegrationSyncBadgeProps = {
  entityKind: CrmSyncEntityKind;
  entitySlug?: string;
  integrations: Record<string, unknown> | null | undefined;
};

/**
 * Compact "CRM Sync" table cell: Attio logo + sync status icon, with
 * the record details (external id, last sync, error) in a tooltip. Renders a
 * dash when the entity is not linked to Attio.
 */
export function IntegrationSyncBadge({
  entityKind,
  entitySlug = '',
  integrations,
}: IntegrationSyncBadgeProps) {
  const { t } = useTranslation();
  const syncInfo = getAttioSyncInfo(integrations);
  const syncState = useCrmSyncState({ entityKind, entitySlug });

  if (!syncInfo && syncState.status === 'idle') {
    return <span className="text-muted-foreground">-</span>;
  }
  const pendingStatus = syncState.status === 'delayed' ? 'delayed' : 'pending';
  const badgeContent = (
    <>
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded bg-white shadow-sm ring-1 ring-black/10 dark:bg-black dark:ring-white/15"
        aria-hidden
      >
        <AttioLogo className="h-3 w-auto" />
      </span>
      {syncState.status !== 'idle' ? (
        <PendingStateIcon status={pendingStatus} />
      ) : syncInfo ? (
        <SyncStateIcon lastError={syncInfo.lastError} />
      ) : (
        <PendingStateIcon status={pendingStatus} />
      )}
    </>
  );
  const tooltipContent = (
    <TooltipContent
      collisionPadding={16}
      className="max-h-[min(16rem,calc(100dvh-2rem))] max-w-[min(28rem,calc(100vw-2rem))] overflow-hidden text-left whitespace-normal"
    >
      {syncState.status !== 'idle' ? (
        <PendingTooltipContent
          status={pendingStatus}
          linked={Boolean(syncInfo)}
        />
      ) : syncInfo ? (
        <SyncTooltipContent syncInfo={syncInfo} />
      ) : (
        <PendingTooltipContent status={pendingStatus} linked={false} />
      )}
    </TooltipContent>
  );

  if (syncState.status === 'idle' && syncInfo?.lastError) {
    return (
      <Dialog>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <button
                type="button"
                className="flex w-fit cursor-pointer items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={t(
                  'Pages.Integrations.Connectors.EntitySync.errorDialog.openLabel',
                )}
                onClick={(event) => event.stopPropagation()}
              >
                {badgeContent}
              </button>
            </DialogTrigger>
          </TooltipTrigger>
          {tooltipContent}
        </Tooltip>
        <SyncErrorDialogContent
          error={syncInfo.lastError}
          externalId={syncInfo.externalId}
          syncedAt={syncInfo.syncedAt}
        />
      </Dialog>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Focusable so keyboard/SR users can reach the status tooltip (the
            focus-visible ring backs this intent). react-doctor flags the
            tabIndex but removing it would drop keyboard access to the tooltip. */}
        <span
          tabIndex={0}
          className="flex w-fit items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {badgeContent}
        </span>
      </TooltipTrigger>
      {tooltipContent}
    </Tooltip>
  );
}

function PendingStateIcon({
  status,
}: {
  status: Exclude<CrmSyncStatus, 'idle'>;
}) {
  const { t } = useTranslation();
  if (status === 'delayed') {
    return (
      <AlertTriangle
        className="size-3.5 text-warning-subtle-foreground"
        aria-label={t('Pages.Integrations.Connectors.EntitySync.statusDelayed')}
      />
    );
  }

  return (
    <LoaderCircle
      className="size-3.5 animate-spin text-muted-foreground"
      aria-label={t('Pages.Integrations.Connectors.EntitySync.statusPending')}
    />
  );
}

function SyncStateIcon({ lastError }: { lastError: string | null }) {
  const { t } = useTranslation();
  if (lastError) {
    return (
      <AlertTriangle
        className="size-3.5 text-destructive-subtle-foreground"
        aria-label={t('Pages.Integrations.Connectors.EntitySync.statusError')}
      />
    );
  }
  return (
    <CheckCircle2
      className="size-3.5 text-success-subtle-foreground"
      aria-label={t('Pages.Integrations.Connectors.EntitySync.statusSynced')}
    />
  );
}

function PendingTooltipContent({
  linked,
  status,
}: {
  linked: boolean;
  status: Exclude<CrmSyncStatus, 'idle'>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">
        {status === 'pending'
          ? t('Pages.Integrations.Connectors.EntitySync.statusPending')
          : t('Pages.Integrations.Connectors.EntitySync.statusDelayed')}
      </span>
      <span>
        {status === 'pending'
          ? t(
              linked
                ? 'Pages.Integrations.Connectors.EntitySync.updatingDescription'
                : 'Pages.Integrations.Connectors.EntitySync.pendingDescription',
            )
          : t('Pages.Integrations.Connectors.EntitySync.delayedDescription')}
      </span>
    </div>
  );
}

function SyncTooltipContent({ syncInfo }: { syncInfo: AttioSyncInfo }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">
        {t('Pages.Integrations.Connectors.EntitySync.tooltipTitle')}
      </span>
      <span className="font-mono">{syncInfo.externalId}</span>
      <span>
        {t('Pages.Integrations.Connectors.EntitySync.lastSynced')}{' '}
        {formatSyncedAt(
          syncInfo.syncedAt,
          t('Pages.Integrations.Connectors.EntitySync.never'),
        )}
      </span>
      {syncInfo.lastError ? (
        <span className="line-clamp-4 break-words [overflow-wrap:anywhere]">
          {syncInfo.lastError}
        </span>
      ) : null}
    </div>
  );
}
