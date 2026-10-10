import { useRouter } from '@tanstack/react-router';
import { Undo2 } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Redemption } from '@/api-client';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
  dataTableSortableHeader,
  TableActionButton,
  TableActions,
} from '@/functionals/table';
import {
  formatServicePeriod,
  formatUtcDate,
  getRedemptionStatus,
} from '../logic';
import { RedemptionStatusBadge, VoucherTypeBadge } from './voucher-badges';

/** What leads each row of the table: the instance on the page of a voucher, the voucher on the page of an instance. */
export type RedemptionsSubject = 'instance' | 'voucher';

type RedemptionsTableProps = {
  /** The body of the table when there is no redemption, which tells why for the screen it is on. */
  emptyMessage?: ReactNode;
  /** Whether the voucher of a row leads to its page: the session may read the vouchers. */
  linksToVouchers?: boolean;
  /** The instant statuses are judged at; now when left out. */
  now?: number;
  /** Asks to revoke a redemption. Left out where the session may not: there is no action then. */
  onRevoke?: (redemption: Redemption) => void;
  redemptions: readonly Redemption[];
  subject: RedemptionsSubject;
};

function SubjectCell({
  redemption,
  subject,
}: {
  redemption: Redemption;
  subject: RedemptionsSubject;
}) {
  const { t } = useTranslation();

  if (subject === 'instance') {
    return <span className="font-mono text-sm">{redemption.instanceSlug}</span>;
  }

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{redemption.voucherName}</span>
        <VoucherTypeBadge type={redemption.voucherType} />
      </div>
      <span className="block text-xs text-muted-foreground">
        {t('Features.Billing.Redemptions.codeHint', {
          hint: redemption.codeHint,
        })}
      </span>
    </div>
  );
}

/**
 * When a redemption applies: a boost from its redemption to the instant it stops, a
 * discount from its redemption for as many invoices as it discounts, which have no
 * date. A window with no end says so.
 */
function WindowCell({ redemption }: { redemption: Redemption }) {
  const { i18n, t } = useTranslation();

  if (redemption.effectiveExpiresAt) {
    return (
      <span className="text-sm">
        {formatServicePeriod(
          redemption.effectiveStartsAt,
          redemption.effectiveExpiresAt,
          i18n.language,
        )}
      </span>
    );
  }

  return (
    <span className="text-sm">
      {t('Features.Billing.Redemptions.from', {
        date: formatUtcDate(redemption.effectiveStartsAt, i18n.language),
      })}
    </span>
  );
}

/** How many of its invoices a discount has used. A boost is counted in time, not in invoices. */
function ApplicationsCell({ redemption }: { redemption: Redemption }) {
  const { t } = useTranslation();

  if (redemption.voucherType !== 'PRICE') {
    return <span className="text-muted-foreground">{t('Common.none')}</span>;
  }

  return (
    <span className="text-sm tabular-nums">
      {redemption.applicationsMax === null
        ? t('Features.Billing.Redemptions.applicationsUnbounded', {
            count: redemption.applicationsCount,
          })
        : t('Features.Billing.Redemptions.applications', {
            count: redemption.applicationsCount,
            max: redemption.applicationsMax,
          })}
    </span>
  );
}

/** The state of a redemption, and why a revoked one was. */
function StatusCell({
  now,
  redemption,
}: {
  now?: number;
  redemption: Redemption;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-w-0 space-y-1">
      <RedemptionStatusBadge now={now} redemption={redemption} />
      {redemption.status === 'REVOKED' && redemption.revokedReason ? (
        <p className="max-w-56 text-xs whitespace-normal text-muted-foreground">
          {t('Features.Billing.Redemptions.revokedBecause', {
            reason: redemption.revokedReason,
          })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The redemptions of a voucher or of an instance as rows: what led to it, when it was
 * redeemed, the window it applies in, the invoices a discount has used, and its state,
 * which reads from the window for a boost the API never ended. The list is read whole,
 * so the browser sorts and pages it, newest redemption first as it opens. A redemption
 * that still applies can be revoked where the session may, from its row.
 */
export function RedemptionsTable({
  emptyMessage,
  linksToVouchers = false,
  now,
  onRevoke,
  redemptions,
  subject,
}: RedemptionsTableProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const columns = useMemo<ColumnDef<Redemption>[]>(
    () => [
      {
        accessorFn: (redemption) =>
          subject === 'instance'
            ? redemption.instanceSlug
            : redemption.voucherName,
        cell: ({ row }) => (
          <SubjectCell redemption={row.original} subject={subject} />
        ),
        header: dataTableSortableHeader(
          t(
            subject === 'instance'
              ? 'Features.Billing.Redemptions.Columns.instance'
              : 'Features.Billing.Redemptions.Columns.voucher',
          ),
        ),
        id: 'subject',
      },
      {
        accessorFn: (redemption) => Date.parse(redemption.redeemedAt),
        cell: ({ row }) => (
          <span className="text-sm">
            {formatUtcDate(row.original.redeemedAt)}
          </span>
        ),
        header: dataTableSortableHeader(
          t('Features.Billing.Redemptions.Columns.redeemed'),
        ),
        id: 'redeemed',
        meta: { defaultSort: 'desc' },
      },
      {
        cell: ({ row }) => <WindowCell redemption={row.original} />,
        enableSorting: false,
        header: t('Features.Billing.Redemptions.Columns.window'),
        id: 'window',
      },
      {
        cell: ({ row }) => <ApplicationsCell redemption={row.original} />,
        enableSorting: false,
        header: t('Features.Billing.Redemptions.Columns.applications'),
        id: 'applications',
      },
      {
        accessorFn: (redemption) => getRedemptionStatus(redemption, now),
        cell: ({ row }) => <StatusCell now={now} redemption={row.original} />,
        header: dataTableSortableHeader(
          t('Features.Billing.Redemptions.Columns.status'),
        ),
        id: 'status',
      },
      ...(onRevoke
        ? [
            createActionsColumn<Redemption>((redemption) => (
              <TableActions>
                {getRedemptionStatus(redemption, now) === 'ACTIVE' ? (
                  <TableActionButton
                    onClick={() => onRevoke(redemption)}
                    tooltip={t('Features.Billing.Redemptions.revoke', {
                      name: redemption.voucherName,
                    })}
                  >
                    <Undo2 className="size-4" />
                  </TableActionButton>
                ) : null}
              </TableActions>
            )),
          ]
        : []),
    ],
    [now, onRevoke, subject, t],
  );

  const getPath = (redemption: Redemption) =>
    subject === 'instance'
      ? router.buildLocation({
          params: { instanceSlug: redemption.instanceSlug },
          to: '/customers/instances/$instanceSlug/billing',
        }).pathname
      : linksToVouchers
        ? router.buildLocation({
            params: { voucherId: redemption.voucherId },
            to: '/catalog/vouchers/$voucherId',
          }).pathname
        : undefined;

  return (
    <DataTable
      columns={columns}
      data={redemptions as Redemption[]}
      emptyMessage={emptyMessage}
      getPath={getPath}
      getRowId={(redemption) => redemption.id}
      linkColumnId="subject"
      variant="simple"
    />
  );
}
