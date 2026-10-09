import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { CopyValueButton } from '@/components/copy-value-button';
import { Page } from '@/functionals/page';

type VoucherHeaderCodeProps = {
  voucher: Pick<Voucher, 'code' | 'codeHint'>;
};

/**
 * The code that redeems the voucher, under its name, in monospace with a Copy button.
 * The API gives it to the sessions that may read vouchers only; to any other, and in every
 * event, only its last four characters exist, which is what is said instead, as plain
 * text. The code is a secret of a kind -- whoever has it can redeem the offer -- so it
 * lives in this line and the memory of the page and nowhere else: not in the address, not
 * in a key of the cache, not in the storage of the browser. Copying is the way it leaves.
 */
export function VoucherHeaderCode({ voucher }: VoucherHeaderCodeProps) {
  const { t } = useTranslation();

  if (!voucher.code) {
    return (
      <Page.Subtitle>
        {t('Pages.Vouchers.Detail.subtitle', { hint: voucher.codeHint })}
      </Page.Subtitle>
    );
  }

  return (
    <div
      aria-label={t('Pages.Vouchers.Code.label')}
      className="flex min-w-0 items-center gap-2"
      role="group"
    >
      <code
        className="min-w-0 rounded-md bg-muted px-2 py-1 font-mono text-sm break-all"
        data-testid="voucher-code"
      >
        {voucher.code}
      </code>
      <CopyValueButton
        copiedMessage={t('Pages.Vouchers.Code.copied')}
        copyFailedMessage={t('Pages.Vouchers.Code.copyFailed')}
        label={t('Pages.Vouchers.Code.copy')}
        testId="voucher-code-copy"
        value={voucher.code}
      />
    </div>
  );
}
