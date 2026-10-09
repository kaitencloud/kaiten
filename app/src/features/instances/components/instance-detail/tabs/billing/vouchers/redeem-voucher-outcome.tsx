import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import {
  formatUtcDate,
  Money,
  RedemptionStatusBadge,
  useAlertFocus,
} from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import { describeEffectiveChange } from '../../../../../utils/instance-addon-effects.utils';
import type { RedeemOutcome } from '../../../../../hooks/use-redeem-voucher';

type RedeemVoucherOutcomeProps = {
  entitlements: readonly Pick<Entitlement, 'name' | 'slug'>[];
  outcome: RedeemOutcome;
};

/**
 * What a redemption did, from the API's own figures read before and after it. A boost
 * lists the entitlements whose effective value moved, and until when; a discount shows
 * the invoice the next boundary will issue before and after, and how many invoices it
 * will discount. Nothing is computed here: when a figure could not be read, the dialog
 * says only that the redemption was made. It takes the focus the button that redeemed
 * the code had: that button is gone with the form, and the keyboard would land on nothing.
 */
export function RedeemVoucherOutcome({
  entitlements,
  outcome,
}: RedeemVoucherOutcomeProps) {
  const { i18n, t } = useTranslation();
  const { changes, invoice, redemption } = outcome;
  const base = 'Pages.Customers.Instances.Detail.Billing.Vouchers.Outcome';
  const statusRef = useAlertFocus(true, outcome);

  return (
    <div
      className="space-y-4 outline-none"
      data-testid="redeem-outcome"
      ref={statusRef}
      role="status"
      tabIndex={-1}
    >
      <DetailCard.Rows>
        <DetailCard.Row
          label={t(`${base}.voucher`)}
          value={redemption.voucherName}
        />
        <DetailCard.Row
          label={t(`${base}.status`)}
          value={<RedemptionStatusBadge redemption={redemption} />}
        />
        {redemption.effectiveExpiresAt ? (
          <DetailCard.Row
            label={t(`${base}.until`)}
            value={formatUtcDate(redemption.effectiveExpiresAt, i18n.language)}
          />
        ) : null}
        {redemption.voucherType === 'PRICE' ? (
          <DetailCard.Row
            label={t(`${base}.applications`)}
            value={
              redemption.applicationsMax === undefined
                ? t(`${base}.everyInvoice`)
                : t(`${base}.invoices`, { count: redemption.applicationsMax })
            }
          />
        ) : null}
      </DetailCard.Rows>
      {changes.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t(`${base}.changes`)}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {changes.map((change) => (
              <li key={change.entitlementSlug}>
                {describeEffectiveChange(change, entitlements, t)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {invoice ? (
        <div className="space-y-1.5" data-testid="redeem-outcome-invoice">
          <p className="text-sm font-medium">{t(`${base}.nextInvoice`)}</p>
          <DetailCard.Rows>
            <DetailCard.Row
              label={t(`${base}.before`)}
              value={
                <Money
                  amount={invoice.before.total}
                  currency={invoice.before.currency}
                />
              }
            />
            <DetailCard.Row
              label={t(`${base}.after`)}
              value={
                <Money
                  amount={invoice.after.total}
                  currency={invoice.after.currency}
                />
              }
            />
            <DetailCard.Row
              label={t(`${base}.discount`)}
              value={
                <Money
                  amount={invoice.after.discountTotal}
                  currency={invoice.after.currency}
                />
              }
            />
          </DetailCard.Rows>
        </div>
      ) : null}
      {redemption.voucherType === 'PRICE' && !invoice ? (
        <p className="text-sm text-muted-foreground">
          {t(`${base}.discountNote`)}
        </p>
      ) : null}
    </div>
  );
}
