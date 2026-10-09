import { dateTimeInputToInstant } from '@/lib/date-time-input';
import { majorToMinorDecimal } from '@/lib/money';
import {
  CODE_PATTERN,
  isModifierValue,
  readFixedAmount,
  readPercentage,
  type VoucherFormValues,
  voucherFormSchema,
} from './voucher.schema';

const ERRORS = 'Pages.Vouchers.Wizard.Errors';

type Issue = (path: Array<number | string>, message: string) => void;

/** The offer a voucher makes: its discount, or what it changes, and for how long. */
function checkOffer(values: Partial<VoucherFormValues>, issue: Issue) {
  if (values.duration === 'REPEATING') {
    const periods = values.durationInPeriods;

    if (typeof periods !== 'number' || !(periods >= 1)) {
      issue(['durationInPeriods'], `${ERRORS}.durationInPeriods`);
    }
  }
  if (values.voucherType === 'ENTITLEMENT_BOOST') {
    const grants = values.grants ?? [];

    if (grants.length === 0) {
      issue(['grants'], `${ERRORS}.grants`);
    }
    const seen = new Set<string>();
    grants.forEach((grant, index) => {
      if (!grant.entitlementSlug) {
        issue(['grants', index, 'entitlementSlug'], `${ERRORS}.entitlement`);
      } else if (seen.has(grant.entitlementSlug)) {
        issue(['grants', index, 'entitlementSlug'], `${ERRORS}.duplicate`);
      }
      seen.add(grant.entitlementSlug);
      if (!isModifierValue(grant.modifierType, grant.modifierValue)) {
        issue(
          ['grants', index, 'modifierValue'],
          `${ERRORS}.${grant.modifierType === 'SET' ? 'setValue' : 'positiveValue'}`,
        );
      }
    });

    return;
  }
  if (values.priceDiscountType === 'PERCENTAGE') {
    if (readPercentage(values.percentage ?? '') === null) {
      issue(['percentage'], `${ERRORS}.percentage`);
    }
  } else {
    if (!values.currency) {
      issue(['currency'], `${ERRORS}.currency`);
    }
    if (
      values.currency &&
      readFixedAmount(values.amount ?? '', values.currency) === null
    ) {
      issue(['amount'], `${ERRORS}.amount`);
    }
  }
  if (
    values.priceAppliesTo === 'SELECTED_PRICES' &&
    (values.applicableLicensePriceIds?.length ?? 0) +
      (values.applicableAddonPriceIds?.length ?? 0) ===
      0
  ) {
    issue(['applicableLicensePriceIds'], `${ERRORS}.prices`);
  }
}

/** Who may redeem it, the code, and the limits. */
function checkEligibility(values: Partial<VoucherFormValues>, issue: Issue) {
  const code = (values.code ?? '').trim();

  if (code !== '' && !CODE_PATTERN.test(code)) {
    issue(['code'], `${ERRORS}.code`);
  }
  const minimum = (values.minimumAmount ?? '').trim();

  if (minimum !== '') {
    if (!values.minimumCurrency) {
      issue(['minimumCurrency'], `${ERRORS}.currency`);
    } else if (majorToMinorDecimal(minimum, values.minimumCurrency) === null) {
      issue(['minimumAmount'], `${ERRORS}.minimumAmount`);
    }
  }
  const starts = values.startsAt ?? '';
  const expires = values.expiresAt ?? '';

  if (starts !== '' && dateTimeInputToInstant(starts) === null) {
    issue(['startsAt'], `${ERRORS}.date`);
  }
  if (expires !== '' && dateTimeInputToInstant(expires) === null) {
    issue(['expiresAt'], `${ERRORS}.date`);
  }
  const start = dateTimeInputToInstant(starts);
  const end = dateTimeInputToInstant(expires);

  if (start && end && Date.parse(start) >= Date.parse(end)) {
    issue(['expiresAt'], `${ERRORS}.window`);
  }
}

/** The first step: what the voucher is called and which kind it is. */
export const typeStepSchema = voucherFormSchema.pick({
  description: true,
  name: true,
  voucherType: true,
});

/** The second: the discount or the boost, and how long it lasts. */
export const offerStepSchema = voucherFormSchema
  .pick({
    amount: true,
    applicableAddonPriceIds: true,
    applicableLicensePriceIds: true,
    currency: true,
    duration: true,
    durationInPeriods: true,
    grants: true,
    percentage: true,
    priceAppliesTo: true,
    priceDiscountType: true,
    voucherType: true,
  })
  .superRefine((values, ctx) =>
    checkOffer(values, (path, message) =>
      ctx.addIssue({ code: 'custom', message, path }),
    ),
  );

/** The third: who may redeem it, the code, and the limits. */
export const eligibilityStepSchema = voucherFormSchema
  .pick({
    annualOnly: true,
    applicableAddonIds: true,
    applicableLicenseIds: true,
    code: true,
    expiresAt: true,
    firstTimeOnly: true,
    maxRedemptions: true,
    minimumAmount: true,
    minimumCurrency: true,
    restrictedCustomerSlug: true,
    startsAt: true,
  })
  .superRefine((values, ctx) =>
    checkEligibility(values, (path, message) =>
      ctx.addIssue({ code: 'custom', message, path }),
    ),
  );

/** The steps of the wizard, in order; the last one reviews and publishes. */
export const VOUCHER_STEPS = [
  'type',
  'offer',
  'eligibility',
  'review',
] as const;
export type VoucherStep = (typeof VOUCHER_STEPS)[number];

const STEP_SCHEMAS = {
  eligibility: eligibilityStepSchema,
  offer: offerStepSchema,
  type: typeStepSchema,
} as const;

/** The name TanStack Form gives a member of the form: `grants[0].modifierValue`. */
const fieldName = (path: ReadonlyArray<PropertyKey>): string =>
  path.reduce<string>(
    (name, part) =>
      typeof part === 'number'
        ? `${name}[${part}]`
        : name === ''
          ? String(part)
          : `${name}.${String(part)}`,
    '',
  );

/** The steps that ask for something: the review only reads. */
export type AskingStep = Exclude<VoucherStep, 'review'>;

/**
 * What is wrong with one step, field by field: the first message of each field. A
 * field shows its message once the person has been to it, and a step cannot be left
 * while one of its fields has one.
 */
export function getStepErrors(
  step: AskingStep,
  values: VoucherFormValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const result = STEP_SCHEMAS[step].safeParse(values);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const name = fieldName(issue.path);

      if (!(name in errors)) {
        errors[name] = issue.message;
      }
    }
  }

  return errors;
}

/** What is wrong with the whole form, or nothing: the errors of the three steps that ask. */
export function getVoucherFormErrors(
  values: VoucherFormValues,
): Record<string, string> | undefined {
  const errors = {
    ...getStepErrors('eligibility', values),
    ...getStepErrors('offer', values),
    ...getStepErrors('type', values),
  };

  return Object.keys(errors).length > 0 ? errors : undefined;
}

/** Whether a step has anything to fix, for the button that leaves it. */
export function isStepValid(
  step: AskingStep,
  values: VoucherFormValues,
): boolean {
  return STEP_SCHEMAS[step].safeParse(values).success;
}
