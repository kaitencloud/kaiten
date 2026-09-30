import { Button } from '@/components/ui/button';
import {
  CircleSlash,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GradientButton } from '@/components/gradient-button';

export function RestrictedState() {
  const { t } = useTranslation();

  return (
    <div className="mt-6 flex min-h-[280px] items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 py-10 text-center">
      <div className="max-w-md space-y-3">
        <ShieldAlert className="mx-auto size-9 text-muted-foreground" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {t('Pages.Settings.Metadata.Restricted.title', 'Restricted access')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'Pages.Settings.Metadata.Restricted.description',
              'Your current scopes do not allow reading metadata fields.',
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="mt-6 flex min-h-[280px] items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 py-10 text-center">
      <div className="max-w-md space-y-4">
        <TriangleAlert className="mx-auto size-9 text-destructive-subtle-foreground" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {t('Pages.Settings.Metadata.Error.title', 'Unable to load fields')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'Pages.Settings.Metadata.Error.description',
              'Metadata fields could not be loaded right now.',
            )}
          </p>
        </div>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="size-4" />
          {t('Common.retry', 'Retry')}
        </Button>
      </div>
    </div>
  );
}

type EmptyStateProps = {
  disabled: boolean;
  hasArchivedFields: boolean;
  onCreate: () => void;
};

export function EmptyState({
  disabled,
  hasArchivedFields,
  onCreate,
}: EmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 py-10 text-center">
      <div className="max-w-md space-y-4">
        <CircleSlash className="mx-auto size-8 text-muted-foreground" />
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            {hasArchivedFields
              ? t(
                  'Pages.Settings.Metadata.Empty.activeTitle',
                  'No active metadata fields',
                )
              : t(
                  'Pages.Settings.Metadata.Empty.title',
                  'No metadata fields yet',
                )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'Pages.Settings.Metadata.Empty.description',
              'Create a metadata field to start adding typed metadata to this resource.',
            )}
          </p>
        </div>
        <GradientButton
          label={t(
            'Pages.Settings.Metadata.Empty.createButton',
            'Create your first field',
          )}
          onClick={onCreate}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
