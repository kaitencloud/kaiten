import { defineFormRecovery } from '@/functionals/form-recovery';
import {
  eligibilityStepSchema,
  offerStepSchema,
  typeStepSchema,
  VOUCHER_STEPS,
  type VoucherFormValues,
  voucherFormSchema,
} from '../../schemas';

const LABELS = 'Pages.Vouchers.Wizard.Labels';

const fieldsOf = (schema: { shape: object }) =>
  Object.keys(schema.shape) as (keyof VoucherFormValues & string)[];

/**
 * What the wizard keeps of a new voucher left unsent, and what it does not. The code
 * is never written to the device (the glossary keeps it out of every browser storage):
 * a resume lands on the step that asks for it when it had been typed, and the offer
 * says it is to be entered again. The key of a row of changes tells the rows apart and
 * is no entry of its own. A draft being finished keeps nothing: it is a server object.
 *
 * The fields of each step are those its schema asks for, so that there is one source.
 */
export const voucherRecovery = defineFormRecovery<VoucherFormValues>({
  formId: 'vouchers.create',
  version: 2,
  omit: ['code'],
  ignore: ['grants[].key', 'flagGrants[].key'],
  steps: VOUCHER_STEPS,
  stepFields: {
    eligibility: fieldsOf(eligibilityStepSchema),
    // The type is the first step's; the offer step reads it, and does not ask for it.
    offer: fieldsOf(offerStepSchema).filter((field) => field !== 'voucherType'),
    review: [],
    type: fieldsOf(typeStepSchema),
  },
  schema: voucherFormSchema,
  fieldLabels: {
    amount: { key: `${LABELS}.amount` },
    annualOnly: { key: `${LABELS}.annualOnly` },
    applicableAddonIds: { key: `${LABELS}.addonVersions` },
    applicableAddonPriceIds: { key: `${LABELS}.prices` },
    applicableLicenseIds: { key: `${LABELS}.licenseVersions` },
    applicableLicensePriceIds: { key: `${LABELS}.prices` },
    code: { key: `${LABELS}.code` },
    currency: { key: `${LABELS}.currency` },
    description: { key: `${LABELS}.description` },
    duration: { key: `${LABELS}.duration` },
    durationInPeriods: { key: `${LABELS}.durationInPeriods` },
    expiresAt: { key: `${LABELS}.expiresAt` },
    firstTimeOnly: { key: `${LABELS}.firstTimeOnly` },
    flagGrants: { key: 'Pages.Vouchers.Extensions.flags' },
    hasPrice: { key: 'Features.Billing.VoucherType.PRICE' },
    hasBoost: { key: 'Features.Billing.VoucherType.ENTITLEMENT_BOOST' },
    hasFlags: { key: 'Features.Billing.VoucherType.FLAG_GRANT' },
    grants: { key: `${LABELS}.grants` },
    maxRedemptions: { key: `${LABELS}.maxRedemptions` },
    minimumAmount: { key: `${LABELS}.minimumAmount` },
    minimumCurrency: { key: `${LABELS}.minimumCurrency` },
    name: { key: `${LABELS}.name` },
    percentage: { key: `${LABELS}.percentage` },
    priceAppliesTo: { key: `${LABELS}.appliesTo` },
    priceDiscountType: { key: `${LABELS}.discountType` },
    restrictedCustomerSlug: { key: `${LABELS}.restrictedCustomer` },
    startsAt: { key: `${LABELS}.startsAt` },
    voucherType: { key: 'Pages.Vouchers.Wizard.Steps.type' },
  },
});
