import type { TFunction } from 'i18next';
import type { Voucher } from '@/api-client';
import {
  getVoucherStatus,
  getVoucherStatusLabelKey,
  getVoucherTypeLabelKey,
  VOUCHER_STATUSES,
  VOUCHER_TYPES,
} from '@/domains/billing';
import type { FilterFieldDefinition } from '@/functionals/filters';

/** The ids of the filters of the list: the search is pinned, the others are picked from the Filter menu. */
export const VOUCHER_FILTER_IDS = {
  search: 'query',
  status: 'status',
  type: 'type',
} as const;

/**
 * What the search of the list matches: the name of a voucher, its code, the last
 * characters of the code, and the customer it is reserved for by name and by slug. A part
 * of any of them is enough, in any case. The search runs in the browser on the list the
 * page holds: what is typed in it is never sent anywhere.
 */
export function getVoucherSearchTokens(
  voucher: Voucher,
  customerNames: Readonly<Record<string, string>>,
): string[] {
  const customer = voucher.restrictedCustomerSlug ?? '';

  return [
    voucher.name,
    voucher.code ?? '',
    voucher.codeHint,
    customer,
    customerNames[customer] ?? '',
  ];
}

/**
 * The fields of the list: the search, then the status, which is the one a person reads
 * (fully redeemed and expired are derived, since the API stores neither as such for a
 * voucher that is still ACTIVE), and the kind of voucher.
 */
export function createVoucherFilterFields({
  customerNames,
  t,
}: {
  customerNames: Readonly<Record<string, string>>;
  t: TFunction;
}): FilterFieldDefinition<Voucher>[] {
  return [
    {
      accessor: (voucher) => getVoucherSearchTokens(voucher, customerNames),
      id: VOUCHER_FILTER_IDS.search,
      label: t('Pages.Vouchers.List.Filters.search'),
      placeholder: t('Pages.Vouchers.List.Filters.searchPlaceholder'),
      type: 'text',
    },
    {
      accessor: (voucher) => getVoucherStatus(voucher),
      id: VOUCHER_FILTER_IDS.status,
      label: t('Pages.Vouchers.List.Filters.status'),
      options: VOUCHER_STATUSES.map((status) => ({
        label: t(getVoucherStatusLabelKey(status)),
        value: status,
      })),
      type: 'enum_list',
    },
    {
      accessor: (voucher) => voucher.voucherType,
      id: VOUCHER_FILTER_IDS.type,
      label: t('Pages.Vouchers.List.Filters.type'),
      options: VOUCHER_TYPES.map((type) => ({
        label: t(getVoucherTypeLabelKey(type)),
        value: type,
      })),
      type: 'enum',
    },
  ];
}
