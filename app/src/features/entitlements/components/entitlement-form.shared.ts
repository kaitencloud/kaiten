import { z } from 'zod';
import type { Entitlement, EntitlementWritable } from '@/api-client';
import { zEntitlementWritable } from '@/api-client/zod.gen';
import {
  RESET_PERIOD_NONE,
  resetAnchorSchema,
  resetPeriodSchema,
} from './entitlement-reset-period.shared';

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

// Creating a schema for entitlement form based on the available fields
// Step 1 of both create wizards, dialog and page, stops at the group selection.
export const entitlementIdentityStepSchema = zEntitlementWritable
  .pick({
    name: true,
    description: true,
    groupSlugs: true,
    icon: true,
  })
  .extend({
    name: entitlementNameSchema,
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
export type EntitlementSelectOption = {
  label: string;
  value: string;
};

export const initialEntitlementFormValues: EntitlementFormValues = {
  name: '',
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

const normalizeUnitLabel = (value?: string | null): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

type UnitFieldsCarrier = Pick<
  EntitlementWritable,
  | 'type'
  | 'unitSingular'
  | 'unitPlural'
  | 'saleUnitSingular'
  | 'saleUnitPlural'
  | 'saleUnitFactor'
>;

/**
 * Normalizes the unit fields of a writable payload so that partially filled
 * unit configurations are dropped rather than rejected by the API: unit fields
 * only apply to NUMBER entitlements, the base pair is all-or-none, and the
 * sale unit trio is all-or-none on top of the base pair.
 */
export const conditionUnitFields = (body: UnitFieldsCarrier): void => {
  body.unitSingular = normalizeUnitLabel(body.unitSingular);
  body.unitPlural = normalizeUnitLabel(body.unitPlural);
  body.saleUnitSingular = normalizeUnitLabel(body.saleUnitSingular);
  body.saleUnitPlural = normalizeUnitLabel(body.saleUnitPlural);
  if (
    body.saleUnitFactor == null ||
    !Number.isFinite(body.saleUnitFactor) ||
    body.saleUnitFactor <= 0
  ) {
    body.saleUnitFactor = undefined;
  }

  if (body.type !== 'NUMBER' || !body.unitSingular || !body.unitPlural) {
    body.unitSingular = undefined;
    body.unitPlural = undefined;
    body.saleUnitSingular = undefined;
    body.saleUnitPlural = undefined;
    body.saleUnitFactor = undefined;
    return;
  }

  if (
    !body.saleUnitSingular ||
    !body.saleUnitPlural ||
    body.saleUnitFactor === undefined
  ) {
    body.saleUnitSingular = undefined;
    body.saleUnitPlural = undefined;
    body.saleUnitFactor = undefined;
  }
};

/**
 * Builds a complete EntitlementWritable from an existing entitlement,
 * applying optional field overrides. Used for partial edits (rename, icon
 * change) that must resend the full object. Mirrors the aggregationMethod and
 * unit-field conditioning the form applies on submit.
 *
 * resetPeriod/resetAnchor are immutable once set (see the API's one-way-door
 * rule) and this path never edits them, so they are always echoed back
 * unchanged -- omitting them on this full-replace PUT would read as an
 * attempted removal and the API would reject it with a 400.
 */
export const entitlementToUpdateBody = (
  entitlement: Entitlement,
  overrides?: Partial<EntitlementWritable>,
): EntitlementWritable => {
  const body: EntitlementWritable = {
    aggregationMethod: entitlement.aggregationMethod,
    description: entitlement.description ?? '',
    groupSlugs:
      entitlement.entitlementGroups?.flatMap((group) =>
        group.slug ? [group.slug] : [],
      ) ?? [],
    icon: entitlement.icon ?? undefined,
    name: entitlement.name,
    type: entitlement.type,
    userFacing: entitlement.userFacing ?? false,
    displayOrder: entitlement.displayOrder ?? 0,
    unitSingular: entitlement.unitSingular ?? undefined,
    unitPlural: entitlement.unitPlural ?? undefined,
    saleUnitSingular: entitlement.saleUnitSingular ?? undefined,
    saleUnitPlural: entitlement.saleUnitPlural ?? undefined,
    saleUnitFactor: entitlement.saleUnitFactor ?? undefined,
    resetPeriod: entitlement.resetPeriod,
    resetAnchor: entitlement.resetAnchor,
    ...overrides,
  };

  if (body.type !== 'NUMBER') {
    body.aggregationMethod = undefined;
  }

  conditionUnitFields(body);

  return body;
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
