import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { vouchersQueryOptions } from '../../queries';
import { VoucherList } from '../list/voucher-list';

/**
 * The page of the vouchers: every voucher of the organization, to search, to filter and
 * to open, and the button that makes a new one. The route loads the list, like the other
 * list pages load theirs, and the list filters, sorts and pages it.
 */
export function VouchersPageContent() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(vouchersQueryOptions);
  const VoucherIcon = dataModelIcons.voucher;

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <VoucherIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Vouchers.title')}</Page.Title>
            <Page.Subtitle>{t('Pages.Vouchers.subtitle')}</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <div className="min-h-0 flex-1">
        <VoucherList vouchers={data.items} />
      </div>
    </Page>
  );
}
