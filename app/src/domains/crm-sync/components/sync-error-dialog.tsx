import { AlertCircle } from 'lucide-react';
import type { MouseEventHandler, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatSyncedAt } from './sync-status-badge';

type SyncErrorDialogContentProps = {
  error: string;
  externalId: string;
  syncedAt: string | null;
};

type SyncErrorDialogProps = SyncErrorDialogContentProps & {
  children: ReactNode;
  onTriggerClick?: MouseEventHandler<HTMLButtonElement>;
};

export function SyncErrorDialog({
  children,
  error,
  externalId,
  syncedAt,
  onTriggerClick,
}: SyncErrorDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t(
            'Pages.Integrations.Connectors.EntitySync.errorDialog.openLabel',
          )}
          onClick={onTriggerClick}
        >
          {children}
        </button>
      </DialogTrigger>
      <SyncErrorDialogContent
        error={error}
        externalId={externalId}
        syncedAt={syncedAt}
      />
    </Dialog>
  );
}

export function SyncErrorDialogContent({
  error,
  externalId,
  syncedAt,
}: SyncErrorDialogContentProps) {
  const { t } = useTranslation();

  return (
    <DialogContent
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertCircle className="size-5 text-destructive-subtle-foreground" />
          {t('Pages.Integrations.Connectors.EntitySync.errorDialog.title')}
        </DialogTitle>
        <DialogDescription>
          {t(
            'Pages.Integrations.Connectors.EntitySync.errorDialog.description',
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="font-medium">
              {t(
                'Pages.Integrations.Connectors.EntitySync.errorDialog.recordId',
              )}
            </p>
            <p className="font-mono text-muted-foreground break-all">
              {externalId}
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">
              {t(
                'Pages.Integrations.Connectors.EntitySync.errorDialog.lastAttempt',
              )}
            </p>
            <p className="text-muted-foreground">
              {formatSyncedAt(
                syncedAt,
                t('Pages.Integrations.Connectors.EntitySync.never'),
              )}
            </p>
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-medium">
            {t(
              'Pages.Integrations.Connectors.EntitySync.errorDialog.errorDetails',
            )}
          </p>
          <p className="rounded-md border bg-muted/30 p-3 font-mono text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {error}
          </p>
        </div>
      </div>
    </DialogContent>
  );
}
