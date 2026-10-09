import { useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { useVoucherReferences } from '../../hooks/use-voucher-references';
import { voucherQueryOptions } from '../../queries';
import { VoucherCodeCard } from '../detail/voucher-code-card';
import { VoucherDetailHeader } from '../detail/voucher-detail-header';
import { VoucherRedemptionsCard } from '../detail/voucher-redemptions-card';
import { VoucherSummaryCard } from '../detail/voucher-summary-card';

type VoucherDetailPageProps = {
  /** A dialog the route opens over the page, such as the one that changes a published voucher. */
  children?: ReactNode;
  voucherId: string;
};

/**
 * One voucher: the code that redeems it, what it does in plain language, and what was
 * redeemed of it, with the actions its state offers. The page reads the voucher as the
 * API stores it and reads it again after every action; the figures of its state are the
 * ones the console derives from its window and its count, and nothing is added up. The
 * code is shown here, to the sessions that may read vouchers, and nowhere in the address.
 */
export function VoucherDetailPage({
  children,
  voucherId,
}: VoucherDetailPageProps) {
  const { data: voucher } = useSuspenseQuery(voucherQueryOptions(voucherId));
  const references = useVoucherReferences();

  return (
    <DetailEntityLayout>
      <DetailEntityLayout.Top>
        <VoucherDetailHeader voucher={voucher} />
      </DetailEntityLayout.Top>
      <DetailEntityLayout.Body>
        <DetailEntityLayout.Content className="space-y-4 pt-1 pb-6 lg:space-y-6">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
            <VoucherCodeCard voucher={voucher} />
            <VoucherSummaryCard names={references.names} voucher={voucher} />
          </div>
          <VoucherRedemptionsCard voucher={voucher} />
        </DetailEntityLayout.Content>
      </DetailEntityLayout.Body>
      {children}
    </DetailEntityLayout>
  );
}
