import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isRetryable } from '../beta-features';
import type { BetaFeatureProblem } from '../types';
import type { BetaFeatureToggleFailure } from '../use-beta-feature-toggle';
import { useBetaFeatureCopy } from './use-beta-feature-copy';

const KEYS: Record<BetaFeatureProblem, string> = {
  'invalid-body': 'invalidBody',
  'missing-scope': 'missingScope',
  'not-toggleable': 'notToggleable',
  'not-provisioned': 'notProvisioned',
  'not-accepted': 'notAccepted',
  unavailable: 'unavailable',
  unexpected: 'unexpected',
};

/**
 * Why the last toggle did not change the beta. Above the list rather than in
 * its row: a beta that is no longer open leaves the list as it is read again.
 * Only what may pass on a second try is offered again.
 */
export function BetaFeatureProblemAlert({
  failure,
  onRetry,
  onDismiss,
}: {
  failure: BetaFeatureToggleFailure;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const copyOf = useBetaFeatureCopy();
  const key = KEYS[failure.problem];
  const { title } = copyOf(failure.beta);

  return (
    <Alert
      data-problem={failure.problem}
      data-testid="beta-feature-problem"
      variant="destructive"
    >
      <AlertTitle>
        {t(`Pages.Settings.BetaFeatures.Problems.${key}.title`, { title })}
      </AlertTitle>
      <AlertDescription>
        <p>{t(`Pages.Settings.BetaFeatures.Problems.${key}.description`)}</p>
        <div className="mt-3 flex gap-2">
          {isRetryable(failure.problem) && (
            <Button onClick={onRetry} size="sm" variant="outline">
              {t('Pages.Settings.BetaFeatures.retry')}
            </Button>
          )}
          <Button onClick={onDismiss} size="sm" variant="ghost">
            {t('Pages.Settings.BetaFeatures.dismiss')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
