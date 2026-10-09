import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Redemption } from '@/api-client';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { ListEmptyState, PagedListSkeleton } from './paged-list';
import { RedemptionsTable, type RedemptionsSubject } from './redemptions-table';
import { RetryableProblem } from './retryable-problem';

/** What the card reads of the query its page brings. */
type RedemptionsQueryResult = Pick<
  UseQueryResult<{ items: Redemption[] }, unknown>,
  'data' | 'error' | 'isError' | 'isPending' | 'refetch'
>;

type RedemptionsCardProps = {
  /** What the card says it lists: "What was redeemed of this voucher." */
  description: string;
  /** What to say when there is no redemption yet, which tells why for the screen it is on. */
  emptyDescription: string;
  /** Whether the voucher of a row leads to its page: the session may read the vouchers. */
  linksToVouchers?: boolean;
  /** Asks to revoke a redemption. Left out where the session may not: no row has an action. */
  onRevoke?: (redemption: Redemption) => void;
  /** The redemptions, read by the page that shows them. */
  query: RedemptionsQueryResult;
  /** What leads each row: the instance on the page of a voucher, the voucher on the page of an instance. */
  subject: RedemptionsSubject;
  /** A prefix for the test ids of the states of the card, so that two lists on a page stay apart. */
  testIdPrefix: string;
  /** Actions beside the title, such as the one that applies a code to an instance. */
  actions?: ReactNode;
};

/**
 * The redemptions of one subject, a voucher or an instance, in a card of its page: the
 * same table on both, sorted and paged in the browser since the card holds them all. The
 * page brings the query, so that it decides what it lists and what refreshes it; the card
 * draws its four states, loading, refused with a way to ask again, empty and populated.
 */
export function RedemptionsCard({
  actions,
  description,
  emptyDescription,
  linksToVouchers,
  onRevoke,
  query,
  subject,
  testIdPrefix,
}: RedemptionsCardProps) {
  const { t } = useTranslation();
  const Icon = dataModelIcons.voucher;
  const redemptions = query.data?.items ?? [];

  // The states that are not the table sit inside the card's own gutter and end with its
  // own space: the card owns them, and none of them pads itself for it.
  function renderState(state: ReactNode) {
    return <div className="px-6 pb-6">{state}</div>;
  }

  function renderBody() {
    if (query.isPending) {
      return renderState(
        <PagedListSkeleton
          label={t('Features.Billing.Redemptions.loading')}
          rowClassName="h-12"
          rows={3}
        />,
      );
    }
    if (query.isError && !query.data) {
      return renderState(
        <RetryableProblem
          data-testid={`${testIdPrefix}-error`}
          error={query.error}
          onRetry={() => void query.refetch()}
        />,
      );
    }
    if (redemptions.length === 0) {
      return renderState(
        <ListEmptyState
          className="py-10"
          description={emptyDescription}
          icon={Icon}
          testId={`${testIdPrefix}-empty`}
          title={t('Features.Billing.Redemptions.emptyTitle')}
        />,
      );
    }

    return (
      <RedemptionsTable
        linksToVouchers={linksToVouchers}
        onRevoke={onRevoke}
        redemptions={redemptions}
        subject={subject}
      />
    );
  }

  return (
    <TableCard>
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <Icon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>
              {t('Features.Billing.Redemptions.title')}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>{description}</TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
        {actions ? (
          <TableCard.HeaderActions>{actions}</TableCard.HeaderActions>
        ) : null}
      </TableCard.Header>
      <TableCard.Content>{renderBody()}</TableCard.Content>
    </TableCard>
  );
}
