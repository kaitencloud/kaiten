import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';
import { VoucherCodeBox } from '../shared/voucher-code-box';

type VoucherCodeCardProps = {
  voucher: Pick<Voucher, 'code' | 'codeHint'>;
};

/**
 * The code that redeems the voucher, to copy and hand to the customer. The API gives it
 * to the sessions that may read vouchers only; to any other, and in every event, only its
 * last four characters exist, which is what is shown instead.
 */
export function VoucherCodeCard({ voucher }: VoucherCodeCardProps) {
  const { t } = useTranslation();

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Vouchers.Detail.Code.title')}
        </DetailCard.Title>
        <DetailCard.Description>
          {t('Pages.Vouchers.Detail.Code.description')}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        {voucher.code ? (
          <VoucherCodeBox code={voucher.code} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Vouchers.Detail.Code.hidden', { hint: voucher.codeHint })}
          </p>
        )}
      </DetailCard.Content>
    </DetailCard>
  );
}
