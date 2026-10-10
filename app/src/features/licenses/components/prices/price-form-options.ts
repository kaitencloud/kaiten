import { formOptions } from '@tanstack/react-form';
import {
  initialLicensePriceFormValues,
  licensePriceFormSchema,
} from '../../schemas/license-price.schema';

// Shared by the form and the sections that render it, so that each section is
// typed on the values of the form it belongs to.
export const priceFormOpts = formOptions({
  defaultValues: initialLicensePriceFormValues('USD', false),
  validators: { onChange: licensePriceFormSchema },
});
