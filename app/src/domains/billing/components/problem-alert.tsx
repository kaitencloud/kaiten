import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAlertFocus } from '../hooks/use-alert-focus';
import { formatUtcDate, handleBillingProblem } from '../logic';
import { MissingScopeBanner } from './missing-scope-banner';

type ProblemAlertProps = {
  /** Takes the focus when it appears: for a dialog, whose confirmation was disabled while it worked. */
  autoFocus?: boolean;
  className?: string;
  /** What a billing call threw: an `ApiError`, a problem document, anything. */
  error: unknown;
  /** Offered for a failure that changed nothing, when asking again may work. */
  onRetry?: () => void;
};

/**
 * Shows why billing refused a call, for the dialogs and screens that make one.
 * The `detail` of the API's problem document is shown as it is, and nothing is
 * translated per code: a code with no `detail` falls back to a generic message
 * with the `code` in a monospace hint. A few failures change what is offered:
 * a missing scope is a banner that names it, a 503 says nothing was changed and
 * offers a retry, never an optimistic result, and so does a period that is being
 * closed (409 `*.BoundaryPending`), which a minute settles.
 */
export function ProblemAlert({
  autoFocus = false,
  className,
  error,
  onRetry,
}: ProblemAlertProps) {
  const { i18n, t } = useTranslation();
  const problem = handleBillingProblem(error);
  const alertRef = useAlertFocus(autoFocus, error);

  if (problem.kind === 'missing-scope') {
    return (
      <MissingScopeBanner
        autoFocus={autoFocus}
        className={className}
        scope={problem.missingScope}
      />
    );
  }

  const hasDetail = Boolean(problem.detail);
  // Nothing was changed by either, and asking again is what they invite.
  const retryable =
    (problem.kind === 'transient' || problem.kind === 'boundary-pending') &&
    onRetry;

  return (
    <Alert
      className={className}
      data-kind={problem.kind}
      ref={alertRef}
      tabIndex={autoFocus ? -1 : undefined}
      variant="destructive"
    >
      <TriangleAlert />
      <AlertTitle>{t('Features.Billing.Problems.title')}</AlertTitle>
      <AlertDescription>
        <p>{problem.detail ?? t('Features.Billing.Problems.generic')}</p>
        {!hasDetail && problem.code ? (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {problem.code}
          </code>
        ) : null}
        {problem.kind === 'transient' ? (
          <p>
            {problem.providerUnavailable
              ? t('Features.Billing.Problems.providerUnreachable')
              : t('Features.Billing.Problems.transient')}
          </p>
        ) : null}
        {problem.kind === 'boundary-pending' ? (
          <p>{t('Features.Billing.Problems.boundaryPending')}</p>
        ) : null}
        {problem.retentionStart ? (
          <p>
            {t('Features.Billing.Problems.outsideRetention', {
              date: formatUtcDate(problem.retentionStart, i18n.language),
            })}
          </p>
        ) : null}
        {problem.traceId ? (
          <p className="font-mono text-xs">
            {t('Features.Billing.Problems.reference', { id: problem.traceId })}
          </p>
        ) : null}
        {retryable ? (
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            {t('Common.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
