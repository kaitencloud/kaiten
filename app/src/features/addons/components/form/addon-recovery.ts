import { defineFormRecovery } from '@/functionals/form-recovery';
import { type AddonFormValues, addonFormSchema } from '../../schemas';

/**
 * What the creation of an add-on keeps when it is left unsent: a new family, or the
 * next version of one (the context then names the family, so that an input begun for
 * one is never offered for another). Nothing here is a secret, a code entered once or
 * a person's data, so `omit` is empty. One page: no steps.
 */
export const addonRecovery = defineFormRecovery<AddonFormValues>({
  formId: 'addons.create',
  version: 1,
  omit: [],
  schema: addonFormSchema,
  fieldLabels: {
    createAsDraft: { key: 'Pages.Addons.Form.Labels.createAsDraft' },
    description: { key: 'Pages.Addons.Form.Labels.description' },
    increaseBilling: { key: 'Pages.Addons.Form.Labels.increaseBilling' },
    maxQuantity: { key: 'Pages.Addons.Form.Labels.maxQuantity' },
    name: { key: 'Pages.Addons.Form.Labels.name' },
    pricingType: { key: 'Pages.Addons.Form.Labels.pricingType' },
    slug: { key: 'Pages.Addons.Form.Labels.slug' },
    versionName: { key: 'Pages.Addons.Form.Labels.versionName' },
  },
});
