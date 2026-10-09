import { formOptions } from '@tanstack/react-form';
import { initialRedeemVoucherFormValues } from './redeem-voucher.schema';

// Shared by the form and the sections that render it, so that the fields are typed on
// the values of the form they belong to.
export const redeemVoucherFormOpts = formOptions({
  defaultValues: initialRedeemVoucherFormValues,
});
