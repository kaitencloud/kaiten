import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import {
  formatUtcDate,
  getVoucherStatus,
  isVoucherScheduled,
  VoucherStatusBadge,
  VoucherTypeBadge,
} from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import type { VoucherNames } from '../../types';
import { describeVoucherReview } from '../../utils/voucher-review';

type VoucherSummaryCardProps = {
  names: VoucherNames;
  voucher: Voucher;
};

/**
 * What the voucher does, in plain language, as it would be pasted in the e-mail that
 * goes with the code, and the few figures that place it: its state, how many times it
 * was redeemed of how many it can be, and when it was made and last changed. The
 * sentences count a discount in invoices and a boost in billing periods, and name the
 * customer and the versions it is limited to.
 */
export function VoucherSummaryCard({
  names,
  voucher,
}: VoucherSummaryCardProps) {
  const { i18n, t } = useTranslation();
  const sentences = describeVoucherReview(voucher, {
    language: i18n.language,
    names,
    t,
  });
  const scheduled =
    getVoucherStatus(voucher) === 'ACTIVE' && isVoucherScheduled(voucher);

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Vouchers.Detail.Summary.title')}
        </DetailCard.Title>
        <DetailCard.Description>
          {t('Pages.Vouchers.Detail.Summary.description')}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <ul
          aria-label={t('Pages.Vouchers.Review.summary')}
          className="list-disc space-y-1.5 pl-5 text-sm"
          data-testid="voucher-summary"
        >
          {sentences.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
        <DetailCard.Divider />
        <DetailCard.Rows>
          {voucher.description ? (
            <DetailCard.Row
              align="start"
              label={t('Pages.Vouchers.Detail.Fields.description')}
              value={voucher.description}
            />
          ) : null}
          <DetailCard.Row
            label={t('Pages.Vouchers.Detail.Fields.type')}
            value={<VoucherTypeBadge type={voucher.voucherType} />}
          />
          <DetailCard.Row
            label={t('Pages.Vouchers.Detail.Fields.status')}
            value={
              <span className="flex items-center justify-end gap-2">
                {scheduled && voucher.startsAt ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('Pages.Vouchers.List.startsOn', {
                      date: formatUtcDate(voucher.startsAt, i18n.language),
                    })}
                  </span>
                ) : null}
                <VoucherStatusBadge voucher={voucher} />
              </span>
            }
          />
          <DetailCard.Row
            label={t('Pages.Vouchers.Detail.Fields.redeemed')}
            value={
              voucher.maxRedemptions === undefined
                ? t('Pages.Vouchers.List.redeemedUnbounded', {
                    count: voucher.redemptionsCount,
                  })
                : t('Pages.Vouchers.List.redeemed', {
                    count: voucher.redemptionsCount,
                    max: voucher.maxRedemptions,
                  })
            }
          />
          <DetailCard.Row
            label={t('Pages.Vouchers.Detail.Fields.created')}
            value={formatUtcDate(voucher.createdAt, i18n.language)}
          />
          <DetailCard.Row
            label={t('Pages.Vouchers.Detail.Fields.updated')}
            value={formatUtcDate(voucher.updatedAt, i18n.language)}
          />
        </DetailCard.Rows>
      </DetailCard.Content>
    </DetailCard>
  );
}
