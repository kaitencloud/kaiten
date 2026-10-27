import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Voucher } from '@/api-client';
import {
  invalidateVoucherQueries,
  placeRefusalOnFields,
} from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { saveVoucherOnFresh } from '../queries';
import {
  getVoucherEditErrors,
  voucherToEditBody,
  voucherToEditValues,
} from '../schemas';

// The refusal that is about one field of the form, by its code: the API says it in
// prose, in `detail`, and does not locate it.
const REFUSAL_FIELDS = {
  byCode: { 'UpdateVoucher.MaxRedemptionsBelowCount': 'maxRedemptions' },
} as const;

type UseVoucherEditFormOptions = {
  /** Called once the API accepted the change. */
  onSaved: (voucher: Voucher) => void;
  voucher: Voucher;
};

/**
 * The form that changes a voucher once it is published. The API lets only four of its
 * members change -- the name, the description, the end of its window and the most it can
 * be redeemed -- and it takes the whole voucher, comparing every other member with what
 * it holds: so the request restates the voucher as stored with those four replaced
 * (`voucherToEditBody`). The voucher is read again before it is written, and only
 * the members the form changed are put on top of it: a name or an end another tab
 * saved since the form opened stays. A refusal leaves the form as it was typed, on
 * its field when it is about one and above the buttons otherwise.
 */
export function useVoucherEditForm({
  onSaved,
  voucher,
}: UseVoucherEditFormOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<unknown>(null);
  const update = useMutation({ mutationFn: saveVoucherOnFresh });
  // The voucher and the form as they were when the form opened: what the save
  // compares the form with, to tell what was changed from what was not.
  const [opened] = useState(() => ({
    values: voucherToEditValues(voucher),
    voucher,
  }));

  const form = useAppForm({
    defaultValues: opened.values,
    listeners: { onChange: () => setFailure(null) },
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        const saved = await update.mutateAsync({
          edited: voucherToEditBody(opened.voucher, value),
          opened: voucherToEditBody(opened.voucher, opened.values),
          voucherId: voucher.id,
        });
        await invalidateVoucherQueries(queryClient, voucher.id);
        toast.success(t('Pages.Vouchers.Edit.saved'));
        onSaved(saved);
      } catch (error) {
        if (!placeRefusalOnFields(formApi, error, REFUSAL_FIELDS)) {
          setFailure(error);
        }
      }
    },
    validators: {
      onChange: ({ value }) => {
        const errors = getVoucherEditErrors(value, voucher);

        return errors
          ? {
              fields: Object.fromEntries(
                Object.entries(errors).map(([field, message]) => [
                  field,
                  { message },
                ]),
              ),
            }
          : undefined;
      },
    },
  });

  return { failure, form };
}
