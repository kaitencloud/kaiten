import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type {
  PendingArchive,
  PendingDryRunConfirmation,
} from '../metadata-field-helpers';

type ArchiveDialogProps = {
  isPending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  pending: PendingArchive | null;
};

export function ArchiveDialog({
  isPending,
  onConfirm,
  onOpenChange,
  pending,
}: ArchiveDialogProps) {
  const { t } = useTranslation();
  const field = pending?.field ?? null;
  const showLastActiveWarning = pending?.isLastActive ?? false;

  return (
    <AlertDialog open={Boolean(field)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(
              'Pages.Settings.Metadata.Archive.title',
              'Archive metadata field?',
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Pages.Settings.Metadata.Archive.description',
              'Archived fields stay readable for historic metadata but cannot be edited or reordered.',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {field ? (
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="font-medium">{field.label}</span>
            <span className="ml-2 font-mono text-muted-foreground">
              {field.key}
            </span>
          </div>
        ) : null}
        {showLastActiveWarning ? (
          <div className="flex items-start gap-2 rounded-md border border-warning-subtle-foreground/30 bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t(
                'Pages.Settings.Metadata.Archive.lastActiveWarning',
                'This is the last active field for this resource. Dynamic columns and filters built from the schema will disappear from the resource table.',
              )}
            </span>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t('Common.cancel', 'Cancel')}
          </AlertDialogCancel>
          <AlertDialogClose
            render={
              <AlertDialogAction
                variant="destructive"
                disabled={isPending}
                onClick={onConfirm}
              >
                {t('Pages.Settings.Metadata.Archive.confirmButton', 'Archive')}
              </AlertDialogAction>
            }
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type DryRunDialogProps = {
  confirmation: PendingDryRunConfirmation | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

type ImpactSamplesProps = {
  samples: PendingDryRunConfirmation['impact']['samples'];
};

function ImpactSamples({ samples }: ImpactSamplesProps) {
  return samples.map((sample) => (
    <li key={sample.slug}>
      {sample.name} · <span className="font-mono">{sample.slug}</span>
    </li>
  ));
}

export function DryRunDialog({
  confirmation,
  isPending,
  onCancel,
  onConfirm,
}: DryRunDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog
      open={Boolean(confirmation)}
      onOpenChange={(open) => !open && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(
              'Pages.Settings.Metadata.DryRun.title',
              'Existing values may become invalid',
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmation
              ? t(
                  'Pages.Settings.Metadata.DryRun.description',
                  '{{count}} existing value(s) no longer match the new schema.',
                  { count: confirmation.impact.count },
                )
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {confirmation ? (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium">
              {t('Pages.Settings.Metadata.DryRun.examplesTitle', 'Examples')}
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <ImpactSamples samples={confirmation.impact.samples} />
            </ul>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t('Common.cancel', 'Cancel')}
          </AlertDialogCancel>
          <AlertDialogClose
            render={
              <AlertDialogAction disabled={isPending} onClick={onConfirm}>
                {t(
                  'Pages.Settings.Metadata.DryRun.confirmButton',
                  'Save anyway',
                )}
              </AlertDialogAction>
            }
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
