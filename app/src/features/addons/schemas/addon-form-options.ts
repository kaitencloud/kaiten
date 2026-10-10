import { formOptions } from '@tanstack/react-form';
import { addonFormSchema, initialAddonFormValues } from './addon.schema';

// Shared by the form and the fields that render it, so that the fields are typed on
// the values of the form they belong to.
export const addonFormOpts = formOptions({
  defaultValues: initialAddonFormValues(),
  validators: { onChange: addonFormSchema },
});
