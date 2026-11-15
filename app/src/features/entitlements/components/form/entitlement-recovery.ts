import { defineFormRecovery } from '@/functionals/form-recovery';
import {
  type EntitlementFormValues,
  entitlementFormSchema,
} from './entitlement-form.shared';

/**
 * What the creation page of an entitlement keeps when it is left unsent, and
 * what it does not. Nothing here is a secret, a code entered once or a file,
 * so `omit` is empty: every field is stored as typed.
 *
 * The steps are those of `EntitlementCreatePage`, by id and in its order; the
 * fields of each one are those its schema asks for (`getIdentityStepValues`
 * for the first), so that a restore lands on the first step with something to
 * correct.
 */
export const entitlementRecovery = defineFormRecovery<EntitlementFormValues>({
  formId: 'entitlements.create',
  version: 1,
  omit: [],
  steps: ['identity', 'type'],
  stepFields: {
    identity: [
      'name',
      'slug',
      'icon',
      'description',
      'groupSlugs',
      'userFacing',
      'displayOrder',
    ],
    type: [
      'type',
      'aggregationMethod',
      'warningThresholdPercent',
      'unitSingular',
      'unitPlural',
      'saleUnitSingular',
      'saleUnitPlural',
      'saleUnitFactor',
      'resetPeriod',
      'resetAnchor',
    ],
  },
  schema: entitlementFormSchema,
  fieldLabels: {
    name: { key: 'Pages.Entitlements.Mutation.Form.Labels.name' },
    slug: { key: 'Pages.Entitlements.Mutation.Form.Labels.slug' },
    icon: { key: 'Pages.Entitlements.Mutation.Form.Labels.icon' },
    description: { key: 'Pages.Entitlements.Mutation.Form.Labels.description' },
    groupSlugs: { key: 'Pages.Entitlements.Mutation.Form.Labels.groups' },
    userFacing: { key: 'Pages.Entitlements.Mutation.Form.Labels.userFacing' },
    displayOrder: {
      key: 'Pages.Entitlements.Mutation.Form.Labels.displayOrder',
    },
    type: { key: 'Pages.Entitlements.Mutation.Form.Labels.type' },
    aggregationMethod: {
      key: 'Pages.Entitlements.Mutation.Form.Labels.aggregationMethod',
    },
    warningThresholdPercent: { key: 'AI.warningThreshold' },
    unitSingular: {
      key: 'Pages.Entitlements.Mutation.Form.Labels.unitSingular',
    },
    unitPlural: { key: 'Pages.Entitlements.Mutation.Form.Labels.unitPlural' },
    saleUnitSingular: {
      key: 'Pages.Entitlements.Mutation.Form.Labels.saleUnitSingular',
    },
    saleUnitPlural: {
      key: 'Pages.Entitlements.Mutation.Form.Labels.saleUnitPlural',
    },
    saleUnitFactor: {
      key: 'Pages.Entitlements.Mutation.Form.Labels.saleUnitFactor',
    },
    resetPeriod: { key: 'Pages.Entitlements.Mutation.Form.Labels.resetPeriod' },
    resetAnchor: { key: 'Pages.Entitlements.Mutation.Form.Labels.resetAnchor' },
  },
});
