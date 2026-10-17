import { formOptions } from '@tanstack/react-form';
import { initialPlanChangeFormValues } from './plan-change.schema';

// Shared by the form and the field that renders it, so that the field is typed on
// the values of the form it belongs to.
export const planChangeFormOpts = formOptions({
  defaultValues: initialPlanChangeFormValues,
});
