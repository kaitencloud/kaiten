import { HttpResponse } from 'msw/http';
import {
  handleArchiveVoucher,
  handleCreateVoucher,
  handleGetVoucher,
  handleListInstanceVouchers,
  handleListVoucherRedemptions,
  handleListVouchers,
  handleLookupVoucher,
  handlePublishVoucher,
  handleRedeemVoucher,
  handleRevokeInstanceVoucher,
  handleUpdateVoucher,
  handleValidateVoucher,
} from '@/api-client/msw.gen';
import type { Redemption, Voucher } from '@/api-client';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import type { EntitlementEffects } from './billing-addon-handlers';
import { withProblems } from './billing-problems';
import { noop, type PersistMswState } from './persistence';

const VOUCHER_STATUSES: readonly Voucher['status'][] = [
  'DRAFT',
  'ACTIVE',
  'EXPIRED',
  'EXHAUSTED',
  'ARCHIVED',
];
const VOUCHER_TYPES: readonly Voucher['voucherType'][] = [
  'PRICE',
  'ENTITLEMENT_BOOST',
];
const REDEMPTION_STATUSES: readonly Redemption['status'][] = [
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
];

const oneOf = <T extends string>(
  options: readonly T[],
  value: string | null,
): T | undefined => options.find((option) => option === value);

/**
 * The catalogue of vouchers: reading them with their codes, making a draft, replacing
 * it, publishing and archiving, finding a voucher by its code and checking whether a
 * code would redeem. A code travels in the body of the last two, never in a path.
 */
const catalogueHandlers = (
  model: BillingAppModel,
  persist: PersistMswState,
) => {
  const { vouchers } = model;

  return [
    handleListVouchers(
      withProblems(({ request }) => {
        const query = new URL(request.url).searchParams;

        return HttpResponse.json(
          vouchers.listVouchers({
            restrictedCustomerSlug:
              query.get('restrictedCustomerSlug') ?? undefined,
            status: oneOf(VOUCHER_STATUSES, query.get('status')),
            voucherType: oneOf(VOUCHER_TYPES, query.get('voucherType')),
          }),
        );
      }),
    ),
    handleCreateVoucher(
      withProblems(async ({ request }) => {
        const created = vouchers.createVoucher(await request.json());
        persist();
        return HttpResponse.json(created, { status: 201 });
      }),
    ),
    handleLookupVoucher(
      withProblems(async ({ request }) =>
        HttpResponse.json(vouchers.lookupVoucher((await request.json()).code)),
      ),
    ),
    handleValidateVoucher(
      withProblems(async ({ request }) =>
        HttpResponse.json(vouchers.validate(await request.json())),
      ),
    ),
    handleGetVoucher(
      withProblems(({ params }) =>
        HttpResponse.json(vouchers.getVoucher(params.voucherId)),
      ),
    ),
    handleUpdateVoucher(
      withProblems(async ({ params, request }) => {
        const updated = vouchers.updateVoucher(
          params.voucherId,
          await request.json(),
        );
        persist();
        return HttpResponse.json(updated);
      }),
    ),
    handlePublishVoucher(
      withProblems(({ params }) => {
        const published = vouchers.publishVoucher(params.voucherId);
        persist();
        return HttpResponse.json(published);
      }),
    ),
    handleArchiveVoucher(
      withProblems(({ params }) => {
        const archived = vouchers.archiveVoucher(params.voucherId);
        persist();
        return HttpResponse.json(archived);
      }),
    ),
    handleListVoucherRedemptions(
      withProblems(({ params }) =>
        HttpResponse.json(vouchers.listRedemptions(params.voucherId)),
      ),
    ),
  ];
};

/**
 * What an instance redeemed: reading it, redeeming a code and revoking a redemption.
 * A boost changes the effective values of the instance at once, so each write tells the
 * instances (`effects`) that they changed.
 */
const instanceHandlers = (
  model: BillingAppModel,
  persist: PersistMswState,
  effects: EntitlementEffects | undefined,
) => {
  const { vouchers } = model;
  const applied = (instanceSlug: string) => {
    persist();
    effects?.syncEffectiveValues(instanceSlug);
  };

  return [
    handleListInstanceVouchers(
      withProblems(({ params, request }) =>
        HttpResponse.json(
          vouchers.listInstanceVouchers(
            params.instanceSlug,
            oneOf(
              REDEMPTION_STATUSES,
              new URL(request.url).searchParams.get('status'),
            ),
          ),
        ),
      ),
    ),
    handleRedeemVoucher(
      withProblems(async ({ params, request }) => {
        const redeemed = vouchers.redeem(
          params.instanceSlug,
          (await request.json()).code,
        );
        applied(params.instanceSlug);
        return HttpResponse.json(redeemed, { status: 201 });
      }),
    ),
    handleRevokeInstanceVoucher(
      withProblems(async ({ params, request }) => {
        const revoked = vouchers.revoke(
          params.instanceSlug,
          params.instanceVoucherId,
          (await request.json()).reason,
        );
        applied(params.instanceSlug);
        return HttpResponse.json(revoked);
      }),
    ),
  ];
};

/**
 * The API of the vouchers: the catalogue, and what the instances redeemed of it. They are
 * served with the rest of billing, since a voucher exists only where billing does and a
 * subscribe redeems one.
 */
export const billingVoucherHandlers = (
  model: BillingAppModel,
  persist: PersistMswState = noop,
  effects?: EntitlementEffects,
) => [
  ...catalogueHandlers(model, persist),
  ...instanceHandlers(model, persist, effects),
];
