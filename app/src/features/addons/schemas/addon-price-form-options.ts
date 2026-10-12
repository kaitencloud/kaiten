import { formOptions } from '@tanstack/react-form';
import {
  addonPriceFormSchema,
  initialAddonPriceFormValues,
} from './addon-price.schema';

// Shared by the form and the fields that render it, so that the fields are typed on
// the values of the form they belong to.
export const addonPriceFormOpts = formOptions({
  defaultValues: initialAddonPriceFormValues('USD', false),
  validators: { onChange: addonPriceFormSchema },
});
