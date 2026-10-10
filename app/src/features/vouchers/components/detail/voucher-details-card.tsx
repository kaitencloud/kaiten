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

type VoucherDetailsCardProps = {
  voucher: Voucher;
};

/**
 * The few figures that place the voucher: its description, its kind, its state, how many
 * times it was redeemed of how many it can be, and when it was made and last changed.
 */
export function VoucherDetailsCard({ voucher }: VoucherDetailsCardProps) {
  const { i18n, t } = useTranslation();
  const scheduled =
    getVoucherStatus(voucher) === 'ACTIVE' && isVoucherScheduled(voucher);

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Vouchers.Detail.Details.title')}
        </DetailCard.Title>
        <DetailCard.Description>
          {t('Pages.Vouchers.Detail.Details.description')}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
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
