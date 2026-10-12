import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';
import type { VoucherNames } from '../../types';
import { describeVoucherReview } from '../../utils/voucher-review';

type VoucherOfferCardProps = {
  names: VoucherNames;
  voucher: Voucher;
};

/**
 * What the voucher does, in plain language, as it would be pasted in the e-mail that goes
 * with the code. The sentences count a discount in invoices and a boost in billing periods,
 * and name the customer and the versions it is limited to. The figures that place the
 * voucher are the Details card's.
 */
export function VoucherOfferCard({ names, voucher }: VoucherOfferCardProps) {
  const { i18n, t } = useTranslation();
  const sentences = describeVoucherReview(voucher, {
    language: i18n.language,
    names,
    t,
  });

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Vouchers.Detail.Offer.title')}
        </DetailCard.Title>
        <DetailCard.Description>
          {t('Pages.Vouchers.Detail.Offer.description')}
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
      </DetailCard.Content>
    </DetailCard>
  );
}
