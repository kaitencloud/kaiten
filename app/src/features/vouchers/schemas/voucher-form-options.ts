import { formOptions } from '@tanstack/react-form';
import type { VoucherEditValues } from './voucher-edit.schema';
import { initialVoucherFormValues } from './voucher.schema';

// Shared by the form and the sections that render it, so that the fields are typed on
// the values of the form they belong to. The checks are the hook's: they are the three
// schemas of the steps, run together.
export const voucherFormOpts = formOptions({
  defaultValues: initialVoucherFormValues,
});

const emptyEditValues: VoucherEditValues = {
  description: '',
  expiresAt: '',
  maxRedemptions: Number.NaN,
  name: '',
};

/** The same for the form that changes a published voucher. */
export const voucherEditFormOpts = formOptions({
  defaultValues: emptyEditValues,
});
