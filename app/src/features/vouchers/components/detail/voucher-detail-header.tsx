import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { VoucherStatusBadge, VoucherTypeBadge } from '@/domains/billing';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { VoucherActions } from '../actions/voucher-actions';

type VoucherDetailHeaderProps = {
  voucher: Voucher;
};

/**
 * The name of a voucher, with its state and its kind where they are read first, and the
 * actions its stored state offers. The header stays in place while the cards scroll under
 * it, so that a long page keeps its actions in reach.
 */
export function VoucherDetailHeader({ voucher }: VoucherDetailHeaderProps) {
  const { t } = useTranslation();
  const VoucherIcon = dataModelIcons.voucher;

  return (
    <Page.Header>
      <Page.Leading>
        <Page.Icon>
          <VoucherIcon className="size-8 text-primary-subtle-foreground" />
        </Page.Icon>
        <Page.Heading>
          <Page.TitleRow>
            <Page.Title>{voucher.name}</Page.Title>
            <VoucherStatusBadge voucher={voucher} />
            <VoucherTypeBadge type={voucher.voucherType} />
          </Page.TitleRow>
          <Page.Subtitle>
            {t('Pages.Vouchers.Detail.subtitle', { hint: voucher.codeHint })}
          </Page.Subtitle>
        </Page.Heading>
      </Page.Leading>
      <Page.Actions>
        <VoucherActions voucher={voucher} />
      </Page.Actions>
    </Page.Header>
  );
}
