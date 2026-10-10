import { formOptions } from '@tanstack/react-form';
import type { CancelFormValues } from './cancel-subscription.schema';

export const initialCancelFormValues: CancelFormValues = {
  endDate: '',
  mode: 'AT_PERIOD_END',
  reason: '',
  removeAddons: false,
  setEndDate: false,
};

// Shared by the form and the sections that render it, so that the fields are
// typed on the values of the form they belong to.
export const cancelFormOpts = formOptions({
  defaultValues: initialCancelFormValues,
});
