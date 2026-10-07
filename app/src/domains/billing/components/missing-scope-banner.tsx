import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAlertFocus } from '../hooks/use-alert-focus';

type MissingScopeBannerProps = {
  /** Takes the focus when it appears: for a dialog, whose confirmation was disabled while it worked. */
  autoFocus?: boolean;
  className?: string;
  /** The scope the API named in its 403 `Auth.MissingScope`. */
  scope?: string;
};

/**
 * What the console shows when the API refuses a billing call for a missing
 * scope. The console hides what a session cannot do from the scopes of its
 * token, but a token whose identity-provider template predates billing carries
 * none of its scopes, and says nothing: the 403 is how that surfaces, and the
 * banner names the scope and where to add it.
 */
export function MissingScopeBanner({
  autoFocus = false,
  className,
  scope,
}: MissingScopeBannerProps) {
  const { t } = useTranslation();
  const alertRef = useAlertFocus(autoFocus, scope);

  return (
    <Alert
      className={className}
      data-kind="missing-scope"
      ref={alertRef}
      tabIndex={autoFocus ? -1 : undefined}
      variant="destructive"
    >
      <ShieldAlert />
      <AlertTitle>{t('Features.Billing.MissingScope.title')}</AlertTitle>
      <AlertDescription>
        <p>{t('Features.Billing.MissingScope.description')}</p>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          {scope ?? t('Features.Billing.MissingScope.unknownScope')}
        </code>
        <p className="text-xs">
          {t('Features.Billing.MissingScope.templateHint')}
        </p>
      </AlertDescription>
    </Alert>
  );
}
