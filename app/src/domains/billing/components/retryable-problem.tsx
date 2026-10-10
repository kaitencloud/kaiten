import { RefreshCw } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type BillingProblemKind, handleBillingProblem } from '../logic';
import { ProblemAlert } from './problem-alert';

type RetryableProblemProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** What a billing read threw. */
  error: unknown;
  /** Reads again. */
  onRetry: () => void;
};

// Asking again gets the same answer from these.
const FINAL_KINDS: ReadonlyArray<BillingProblemKind> = [
  'missing-scope',
  'outside-retention',
];

/**
 * Why a screen could not read what it shows, in the API's own words, with a way
 * to ask again. Asking again gets the same answer from a session that lacks the
 * scope, so a banner that names it comes without the button, and so does the
 * refusal of a period whose usage is no longer kept: it only ever recedes.
 * Reading changes nothing, so a retry never needs a warning.
 */
export function RetryableProblem({
  className,
  error,
  onRetry,
  ...props
}: RetryableProblemProps) {
  const { t } = useTranslation();

  return (
    <div className={cn('space-y-3', className)} {...props}>
      <ProblemAlert error={error} />
      {FINAL_KINDS.includes(handleBillingProblem(error).kind) ? null : (
        <Button onClick={onRetry} type="button" variant="outline">
          <RefreshCw />
          {t('Common.retry')}
        </Button>
      )}
    </div>
  );
}
