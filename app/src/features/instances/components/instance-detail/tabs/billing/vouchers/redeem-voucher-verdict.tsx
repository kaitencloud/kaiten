import { CircleAlert, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Validity } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { describeVoucherOffer, VoucherTypeBadge } from '@/domains/billing';
import { useAiAccess } from '@/domains/ai-credits';
import {
  isAiVoucherGrant,
  type VoucherEntitlement,
} from '../../../../../utils/voucher-ai';
import { getValidityReasonKey } from '../../../../../utils/voucher-validity';

type RedeemVoucherVerdictProps = {
  /** The entitlements the instance has, to name what a boost changes. */
  entitlements: readonly (VoucherEntitlement & { name: string })[];
  instanceName: string;
  /** What is said of a code that is valid, in place of the sentence about redeeming it now. */
  note?: string;
  validity: Validity;
};

/**
 * What the API said of a code for this instance. A valid code is shown as the offer it
 * makes, in plain language, before anything is redeemed; one that is not says which check
 * failed, and, for an instance that does not meet the voucher, which condition it breaks.
 * The API answers the first failing check only, and so does this. The dialog that
 * subscribes an instance shows the same verdict for the code it was given, and says in its
 * own `note` what happens next.
 */
export function RedeemVoucherVerdict({
  entitlements,
  instanceName,
  note,
  validity,
}: RedeemVoucherVerdictProps) {
  const { i18n, t } = useTranslation();
  const aiAccess = useAiAccess();
  const entitlementNames = Object.fromEntries(
    entitlements.flatMap(({ name, slug }) => (slug ? [[slug, name]] : [])),
  );

  if (validity.valid && validity.voucher) {
    return (
      <Alert data-testid="redeem-verdict-valid">
        <CircleCheck />
        <AlertTitle>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.validTitle',
            { name: validity.voucher.name },
          )}
        </AlertTitle>
        <AlertDescription>
          <div className="flex flex-wrap items-center gap-2">
            <VoucherTypeBadge type={validity.voucher.voucherType} />
            <span>
              {describeVoucherOffer(
                {
                  ...validity.voucher,
                  grants: validity.voucher.grants.filter(
                    (grant) =>
                      aiAccess.available ||
                      !isAiVoucherGrant(grant, entitlements),
                  ),
                },
                {
                  entitlementNames,
                  language: i18n.language,
                  t,
                },
              )}
            </span>
          </div>
          <p>
            {note ??
              t(
                'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.validNote',
                { instance: instanceName },
              )}
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  const reasonKey = getValidityReasonKey(validity);

  return (
    <Alert data-testid="redeem-verdict-invalid" variant="destructive">
      <CircleAlert />
      <AlertTitle>
        {t(
          'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.invalidTitle',
        )}
      </AlertTitle>
      <AlertDescription>
        {reasonKey ? <p>{t(reasonKey)}</p> : null}
      </AlertDescription>
    </Alert>
  );
}
