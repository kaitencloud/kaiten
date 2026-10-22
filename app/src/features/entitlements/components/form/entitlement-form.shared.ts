import { z } from 'zod';
import type { Entitlement } from '@/api-client';
import { zEntitlementWritable } from '@/api-client/zod.gen';
import {
  hasBillingPeriodOnWrongCadence,
  RESET_PERIOD_NONE,
  resetAnchorSchema,
  resetPeriodSchema,
} from './entitlement-reset-period.shared';
import { entitlementSlugSchema } from './entitlement-slug.shared';

// The generated schema already enforces a non-empty name; the override only
// attaches the translated error message.
export const entitlementNameSchema = zEntitlementWritable.shape.name.min(1, {
  message: 'Pages.Entitlements.Mutation.Form.Errors.name',
});

// Deviates from the generated schema (min 1) to tolerate the empty string of a
// cleared input while typing; emptiness is resolved by conditionUnitFields on
// submit and by the cross-field rules below.
const unitLabelSchema = z
  .string()
  .max(100, {
    message: 'Pages.Entitlements.Mutation.Form.Errors.unitLabelTooLong',
  })
  .optional();

const isLabelSet = (value?: string) => Boolean(value && value.trim() !== '');

// The order is a whole number, and the message for a fraction says so: the one of the generated
// schema is the bare type check of the validator. The generated schema still decides the range.
const displayOrderSchema = z
  .custom<number>((value) => Number.isInteger(value), {
    error: 'Pages.Entitlements.Mutation.Form.Errors.displayOrder',
  })
  .optional()
  .pipe(zEntitlementWritable.shape.displayOrder);

// Creating a schema for entitlement form based on the available fields
// Step 1 of both create wizards, dialog and page, holds every field of the identity: the
// name, the slug, the description, the groups, the icon, whether it is shown to customers and
// where it comes in the list. Next opens the second step only when all of them are valid; a
// field left out here would let an error through to the end, where nothing points at it.
export const entitlementIdentityStepSchema = zEntitlementWritable
  .pick({
    name: true,
    description: true,
    groupSlugs: true,
    icon: true,
    userFacing: true,
    displayOrder: true,
  })
  .extend({
    name: entitlementNameSchema,
    slug: entitlementSlugSchema,
    displayOrder: displayOrderSchema,
  });

export const entitlementFormSchema = zEntitlementWritable
  .pick({
    name: true,
    description: true,
    type: true,
    aggregationMethod: true,
    groupSlugs: true,
    icon: true,
    userFacing: true,
    displayOrder: true,
  })
  .extend({
    name: entitlementNameSchema,
    // Optional: left blank, the API generates the slug from the name.
    slug: entitlementSlugSchema,
    displayOrder: displayOrderSchema,
    unitSingular: unitLabelSchema,
    unitPlural: unitLabelSchema,
    saleUnitSingular: unitLabelSchema,
    saleUnitPlural: unitLabelSchema,
    saleUnitFactor: z
      .number()
      .gt(0, {
        message: 'Pages.Entitlements.Mutation.Form.Errors.saleUnitFactor',
      })
      .optional(),
    resetPeriod: resetPeriodSchema,
    resetAnchor: resetAnchorSchema,
  })
  .superRefine((values, ctx) => {
    if (hasBillingPeriodOnWrongCadence(values)) {
      ctx.addIssue({
        code: 'custom',
        path: ['resetAnchor'],
        message: 'Pages.Entitlements.Mutation.Form.Errors.resetAnchorCadence',
      });
    }

    const baseSingular = isLabelSet(values.unitSingular);
    const basePlural = isLabelSet(values.unitPlural);
    const saleFlags = [
      [isLabelSet(values.saleUnitSingular), 'saleUnitSingular'],
      [isLabelSet(values.saleUnitPlural), 'saleUnitPlural'],
      [
        values.saleUnitFactor != null && Number.isFinite(values.saleUnitFactor),
        'saleUnitFactor',
      ],
    ] as const;
    const saleSetCount = saleFlags.filter(([set]) => set).length;

    if (baseSingular !== basePlural) {
      ctx.addIssue({
        code: 'custom',
        path: [baseSingular ? 'unitPlural' : 'unitSingular'],
        message: 'Pages.Entitlements.Mutation.Form.Errors.unitPair',
      });
    }

    if (saleSetCount > 0 && saleSetCount < 3) {
      for (const [set, field] of saleFlags) {
        if (!set) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: 'Pages.Entitlements.Mutation.Form.Errors.saleUnitTrio',
          });
        }
      }
    }

    if (saleSetCount === 3 && !(baseSingular && basePlural)) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitSingular'],
        message: 'Pages.Entitlements.Mutation.Form.Errors.saleUnitRequiresBase',
      });
    }
  });

export type EntitlementFormValues = z.infer<typeof entitlementFormSchema>;

/** The values of the form that the first step asks for, as its schema reads them. */
export const getIdentityStepValues = (values: EntitlementFormValues) => ({
  description: values.description,
  displayOrder: values.displayOrder,
  groupSlugs: values.groupSlugs,
  icon: values.icon,
  name: values.name,
  slug: values.slug,
  userFacing: values.userFacing,
});
export type EntitlementSelectOption = {
  label: string;
  value: string;
};

export const initialEntitlementFormValues: EntitlementFormValues = {
  name: '',
  slug: '',
  description: '',
  type: 'NUMBER',
  aggregationMethod: 'SUM',
  groupSlugs: [],
  icon: undefined,
  userFacing: false,
  displayOrder: 0,
  unitSingular: '',
  unitPlural: '',
  saleUnitSingular: '',
  saleUnitPlural: '',
  saleUnitFactor: undefined,
  resetPeriod: RESET_PERIOD_NONE,
  resetAnchor: 'CALENDAR',
};

export type EntitlementFormProps = {
  entitlement?: Entitlement;
  layout?: 'dialog' | 'page';
  onSuccess?: (entitlement: Entitlement) => void;
  onCancel?: () => void;
  panelClassName?: string;
};

export const entitlementTypeOptions: EntitlementSelectOption[] = [
  { label: 'Boolean', value: 'BOOLEAN' },
  { label: 'Number', value: 'NUMBER' },
  { label: 'Config', value: 'CONFIG' },
];

export const aggregationMethodOptions: EntitlementSelectOption[] = [
  { label: 'Count', value: 'COUNT' },
  { label: 'Sum', value: 'SUM' },
  { label: 'Average', value: 'AVERAGE' },
  { label: 'Min', value: 'MIN' },
  { label: 'Max', value: 'MAX' },
  { label: 'Latest', value: 'LATEST' },
];

export const getEntitlementFormDefaults = (
  entitlement?: Entitlement,
): EntitlementFormValues => {
  if (!entitlement) {
    return initialEntitlementFormValues;
  }

  return {
    aggregationMethod: entitlement.aggregationMethod,
    description: entitlement.description ?? '',
    groupSlugs:
      entitlement.entitlementGroups?.flatMap((group) =>
        group.slug ? [group.slug] : [],
      ) ?? [],
    icon: entitlement.icon ?? undefined,
    name: entitlement.name,
    // Blank on purpose: the slug is fixed once the entitlement exists, so the
    // field shows the stored one without feeding it into the validation or the
    // PUT (a slug that predates today's rules would otherwise block every edit).
    slug: '',
    type: entitlement.type,
    userFacing: entitlement.userFacing ?? false,
    displayOrder: entitlement.displayOrder ?? 0,
    unitSingular: entitlement.unitSingular ?? '',
    unitPlural: entitlement.unitPlural ?? '',
    saleUnitSingular: entitlement.saleUnitSingular ?? '',
    saleUnitPlural: entitlement.saleUnitPlural ?? '',
    saleUnitFactor: entitlement.saleUnitFactor ?? undefined,
    resetPeriod: entitlement.resetPeriod ?? RESET_PERIOD_NONE,
    resetAnchor: entitlement.resetAnchor ?? 'CALENDAR',
  };
};

export const getSelectOptionLabel = (option: unknown) => {
  if (typeof option === 'object' && option !== null && 'label' in option) {
    return String((option as EntitlementSelectOption).label);
  }

  return String(option);
};

export const getSelectOptionValue = (option: unknown) => {
  if (typeof option === 'object' && option !== null && 'value' in option) {
    return String((option as EntitlementSelectOption).value);
  }

  return String(option);
};
