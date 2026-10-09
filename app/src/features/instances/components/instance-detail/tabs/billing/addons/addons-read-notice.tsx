import { useTranslation } from 'react-i18next';
import { RetryableProblem } from '@/domains/billing';

type AddonsReadNoticeProps = {
  /** Why the read failed. */
  error: unknown;
  /** Reads again what failed. */
  onRetry: () => void;
  /** Whether the other add-ons are offered anyway: some could not be checked, not all. */
  partial: boolean;
};

// Written out in full, so that a key that does not exist fails the check of the keys.
const KEYS = {
  all: 'Pages.Customers.Instances.Detail.Billing.Addons.Unread.all',
  partial: 'Pages.Customers.Instances.Detail.Billing.Addons.Unread.partial',
} as const;

/**
 * What an offer of add-ons says when a read behind it failed. A version whose
 * compatibility could not be read is left out rather than offered on a guess, and the
 * others stay; saying so, with the way to ask again, keeps a missing add-on from being
 * taken for one that does not exist.
 */
export function AddonsReadNotice({
  error,
  onRetry,
  partial,
}: AddonsReadNoticeProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2" data-testid="addons-read-notice">
      <p className="text-sm text-muted-foreground">
        {t(partial ? KEYS.partial : KEYS.all)}
      </p>
      <RetryableProblem error={error} onRetry={onRetry} />
    </div>
  );
}
