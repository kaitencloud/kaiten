import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/domains/billing';
import type { SubscribeVoucherChecker } from '../../../../../hooks/use-subscribe-voucher-check';
import { useInstanceDetail } from '../../../instance-detail-context';
import { RedeemVoucherVerdict } from '../vouchers/redeem-voucher-verdict';

type SubscribeVoucherCheckProps = {
  checker: SubscribeVoucherChecker;
  /** The code as it is typed now. */
  code: string;
  /** The flat-fee price the subscription would start on, as it is chosen now. */
  licensePriceId: string;
};

/**
 * Checks the code typed in the dialog that subscribes an instance against the price chosen,
 * before the subscription is sent, and shows what the API said as the dialog that redeems a
 * code does: the offer it makes, or the first check it fails. The verdict is about one code
 * and one price, so it goes as soon as either changes. A check that fails, a limit on the
 * checks included (which is said to be temporary), is shown with a way to ask again, and
 * keeps nothing from the subscription: the subscription still carries the code and stays the
 * authority.
 */
export function SubscribeVoucherCheck({
  checker,
  code,
  licensePriceId,
}: SubscribeVoucherCheckProps) {
  const { t } = useTranslation();
  const { entitlements, instance } = useInstanceDetail();
  const typed = code.trim();
  const { answer } = checker;
  // What was answered is about the pair it was asked about, not the one the form holds now.
  const current =
    answer?.code === typed && answer.licensePriceId === licensePriceId
      ? answer
      : null;
  const ask = () => void checker.check(typed, licensePriceId);

  return (
    <div className="space-y-3" data-testid="subscribe-voucher-check">
      <Button
        disabled={typed === '' || licensePriceId === '' || checker.pending}
        onClick={ask}
        size="sm"
        type="button"
        variant="outline"
      >
        {t('Pages.Customers.Instances.Detail.Billing.Subscribe.Voucher.check')}
      </Button>
      {current?.kind === 'verdict' ? (
        <RedeemVoucherVerdict
          entitlements={entitlements}
          instanceName={instance.name}
          note={t(
            'Pages.Customers.Instances.Detail.Billing.Subscribe.Voucher.validNote',
          )}
          validity={current.validity}
        />
      ) : null}
      {current?.kind === 'failure' ? (
        <ProblemAlert error={current.failure} onRetry={ask} />
      ) : null}
    </div>
  );
}
