import { formOptions } from '@tanstack/react-form';
import {
  initialLicensePreviewValues,
  licensePreviewFormSchema,
} from '../../schemas/license-preview.schema';

// Shared by the form and the fields that render it, so that the fields are typed
// on the values of the form they belong to.
export const previewFormOpts = formOptions({
  defaultValues: initialLicensePreviewValues('', []),
  validators: { onChange: licensePreviewFormSchema },
});
