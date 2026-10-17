import { CircleCheck, CircleX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatBoundary, getProblem } from '@/domains/billing';
import { useCancelFollowUps } from '../../../../../hooks/use-cancel-follow-ups';
import {
  type CancelOutcome,
  getFailedFollowUps,
  hasFailedFollowUps,
  mergeFollowUps,
} from '../../../../../utils/cancellation.utils';
import { useInstanceDetail } from '../../../instance-detail-context';

type FollowUps = CancelOutcome['followUps'];

const DONE_ICON = 'mt-0.5 size-4 shrink-0 text-success-subtle-foreground';
const FAILED_ICON = 'mt-0.5 size-4 shrink-0 text-destructive-subtle-foreground';

/** One add-on that could not be removed, with what the API said. */
function AddonFailureItem({
  addonSlug,
  error,
}: {
  addonSlug: string;
  error: unknown;
}) {
  const { t } = useTranslation();

  return (
    <li className="flex items-start gap-2">
      <CircleX aria-hidden className={FAILED_ICON} />
      <span>
        {t('Pages.Customers.Instances.Detail.Billing.Cancel.Done.addonFailed', {
          addon: addonSlug,
          detail: getProblem(error)?.detail ?? '',
        })}
      </span>
    </li>
  );
}

/** What became of the add-ons asked to be removed: the ones that went, then each one that stayed. */
function AddonsItems({ addons }: { addons: NonNullable<FollowUps['addons']> }) {
  const { t } = useTranslation();

  return (
    <>
      {addons.removed.length > 0 ? (
        <li className="flex items-start gap-2">
          <CircleCheck aria-hidden className={DONE_ICON} />
          {t(
            'Pages.Customers.Instances.Detail.Billing.Cancel.Done.addonsRemoved',
            { addons: addons.removed.join(', ') },
          )}
        </li>
      ) : null}
      {addons.failed.map(({ addonSlug, error }) => (
        <AddonFailureItem addonSlug={addonSlug} error={error} key={addonSlug} />
      ))}
    </>
  );
}

/** What became of the end date asked to be set on the license. */
function EndDateItem({
  endLicenseDate,
}: {
  endLicenseDate: NonNullable<FollowUps['endLicenseDate']>;
}) {
  const { i18n, t } = useTranslation();

  return (
    <li className="flex items-start gap-2">
      {endLicenseDate.ok ? (
        <>
          <CircleCheck aria-hidden className={DONE_ICON} />
          {t(
            'Pages.Customers.Instances.Detail.Billing.Cancel.Done.endDateSet',
            {
              date: formatBoundary(endLicenseDate.instant, i18n.language),
            },
          )}
        </>
      ) : (
        <>
          <CircleX aria-hidden className={FAILED_ICON} />
          <span>
            {t(
              'Pages.Customers.Instances.Detail.Billing.Cancel.Done.endDateFailed',
              { detail: getProblem(endLicenseDate.error)?.detail ?? '' },
            )}
          </span>
        </>
      )}
    </li>
  );
}

/** The outcome of the two things asked beside the cancellation, each done or failed, and a way to try the failed ones again. */
export function FollowUpsReport({ outcome }: { outcome: CancelOutcome }) {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();
  const followUps = useCancelFollowUps(instance);
  const [current, setCurrent] = useState(outcome.followUps);

  if (current.addons === null && current.endLicenseDate === null) {
    return null;
  }
  const retry = async () => {
    setCurrent(
      mergeFollowUps(current, await followUps.run(getFailedFollowUps(current))),
    );
  };

  return (
    <ul className="space-y-2 text-sm" data-testid="cancel-follow-ups">
      {current.addons ? <AddonsItems addons={current.addons} /> : null}
      {current.endLicenseDate ? (
        <EndDateItem endLicenseDate={current.endLicenseDate} />
      ) : null}
      {hasFailedFollowUps(current) ? (
        <li>
          <Button
            disabled={followUps.isPending}
            onClick={() => void retry()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t(
              'Pages.Customers.Instances.Detail.Billing.Cancel.Done.retryFollowUps',
            )}
          </Button>
        </li>
      ) : null}
    </ul>
  );
}
