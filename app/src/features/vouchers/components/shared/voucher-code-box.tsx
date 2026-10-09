import { useTranslation } from 'react-i18next';
import { CopyableValueField } from '@/components/copyable-value-field';

type VoucherCodeBoxProps = {
  code: string;
};

/**
 * A voucher's code, to read and to copy. The code is a secret of a kind -- whoever has
 * it can redeem the offer -- so it lives in this box and the memory of the page and
 * nowhere else: not in the address, not in a key of the cache, not in the storage of the
 * browser. Copying is the way it leaves.
 */
export function VoucherCodeBox({ code }: VoucherCodeBoxProps) {
  const { t } = useTranslation();

  return (
    <CopyableValueField
      copiedMessage={t('Pages.Vouchers.Code.copied')}
      copyFailedMessage={t('Pages.Vouchers.Code.copyFailed')}
      copyLabel={t('Pages.Vouchers.Code.copy')}
      copyTestId="voucher-code-copy"
      inputClassName="text-base tracking-wide"
      inputTestId="voucher-code"
      label={t('Pages.Vouchers.Code.label')}
      value={code}
    />
  );
}
