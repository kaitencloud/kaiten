import { formOptions } from '@tanstack/react-form';
import { initialPublishableKeyFormValues } from './publishable-key.schema';

// Shared by the hook that owns the form and the section that renders it, so that the
// fields are typed on the values of the form they belong to.
export const publishableKeyFormOpts = formOptions({
  defaultValues: initialPublishableKeyFormValues,
});
