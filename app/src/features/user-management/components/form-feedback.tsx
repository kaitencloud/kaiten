import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/** Keeps request errors discoverable inside long, scrollable editors. */
export function FormFeedback({ error }: { error: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-md border border-destructive/30 bg-destructive-subtle p-3 text-sm text-destructive-subtle-foreground focus-visible:outline focus-visible:outline-2"
    >
      <p className="font-medium">{t('Pages.Access.requestFailed')}</p>
      <p className="mt-1">{error}</p>
    </div>
  );
}
