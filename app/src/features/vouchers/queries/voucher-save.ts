import type { VoucherDraft } from '@/api-client';
import { getVoucher, updateVoucher } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import {
  voucherToEditBody,
  voucherToEditValues,
} from '../schemas/voucher-edit.schema';

export type SaveVoucherVariables = {
  /** What the form sends, built from the voucher it opened with. */
  edited: VoucherDraft;
  /** What the form opened with, built by the function that built `edited`. */
  opened: VoucherDraft;
  voucherId: string;
};

/**
 * Updates a published voucher without overwriting what changed since the form
 * opened. The update takes the whole voucher, so the voucher is read again and
 * the four members the form changed are applied on top of it (`writeOnFresh`):
 * the name, the description or the end another tab saved stay. A voucher deleted
 * meanwhile is refused by the read, and nothing is written.
 */
export function saveVoucherOnFresh({
  edited,
  opened,
  voucherId,
}: SaveVoucherVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getVoucher({
        ...FRESH_READ_OPTIONS,
        path: { voucherId },
        throwOnError: true,
      });

      return data;
    },
    restate: (voucher) =>
      voucherToEditBody(voucher, voucherToEditValues(voucher)),
    write: async (body) => {
      const { data } = await updateVoucher({
        body,
        path: { voucherId },
        throwOnError: true,
      });

      return data;
    },
  });
}
