import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { PlanSessionProblem } from '../types';

const KEYS: Record<PlanSessionProblem, string> = {
  'not-enabled': 'notEnabled',
  'not-provisioned': 'notProvisioned',
  forbidden: 'forbidden',
  unavailable: 'unavailable',
};

/**
 * Why there is no plan to show. Only the states that can change on their own
 * offer to ask again: a missing flag or role does not change on a retry.
 */
export function PlanSessionProblemCard({
  problem,
  onRetry,
}: {
  problem: PlanSessionProblem;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const key = KEYS[problem];
  const retryable = problem === 'unavailable' || problem === 'not-provisioned';

  return (
    <Alert data-testid="plan-session-problem" data-problem={problem}>
      <AlertTitle>{t(`Pages.Settings.Plan.Problems.${key}.title`)}</AlertTitle>
      <AlertDescription>
        <p>{t(`Pages.Settings.Plan.Problems.${key}.description`)}</p>
        {retryable && (
          <Button
            className="mt-3"
            onClick={onRetry}
            size="sm"
            variant="outline"
          >
            {t('Pages.Settings.Plan.retry')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
