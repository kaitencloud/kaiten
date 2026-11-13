import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/errors';

export function AiSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="px-1 text-base font-semibold">{title}</legend>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </fieldset>
  );
}

export function AiLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="space-y-4 rounded-lg border bg-card p-5"
      aria-busy="true"
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="h-10 rounded bg-muted" aria-hidden="true" />
      <div className="h-10 rounded bg-muted" aria-hidden="true" />
    </div>
  );
}

export function AiQueryError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="space-y-3 rounded-lg border p-5">
      <p>{getApiErrorMessage(error)}</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        {t('Common.retry')}
      </Button>
    </div>
  );
}
