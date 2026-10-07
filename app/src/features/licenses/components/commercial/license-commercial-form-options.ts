import { formOptions } from '@tanstack/react-form';
import {
  licenseCommercialFormSchema,
  licenseToCommercialFormValues,
} from '../../schemas/license-commercial.schema';

// Shared by the form and the fields that render it, so that the fields are typed
// on the values of the form they belong to.
export const commercialFormOpts = formOptions({
  defaultValues: licenseToCommercialFormValues({}),
  validators: { onChange: licenseCommercialFormSchema },
});
