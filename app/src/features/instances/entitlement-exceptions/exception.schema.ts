import { z } from 'zod';
import type { NewEntitlementException } from '@/api-client';
import { zEntitlement, zNewEntitlementException } from '@/api-client/zod.gen';
import { dateTimeInputToInstant } from '@/lib/date-time-input';

const KEY = 'Pages.EntitlementExceptions';

export function readExceptionConfig(
  text: string,
): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const exceptionFormSchema = zNewEntitlementException
  .pick({ entitlementSlug: true, kind: true, reason: true })
  .extend({
    entitlementSlug: zNewEntitlementException.shape.entitlementSlug.min(
      1,
      `${KEY}.errors.entitlement`,
    ),
    entitlementType: zEntitlement.shape.type,
    reason: zNewEntitlementException.shape.reason
      .trim()
      .min(1, `${KEY}.errors.reason`)
      .max(500, `${KEY}.errors.reason`),
    startsAt: z.string(),
    endsAt: z.string(),
    valueText: z.string(),
    booleanValue: z.boolean(),
    jsonValue: z.string(),
  })
  .superRefine((values, ctx) => {
    const issue = (field: keyof typeof values, message: string) =>
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `${KEY}.errors.${message}`,
      });
    const numeric =
      values.entitlementType === 'NUMBER' ||
      values.entitlementType === 'NUMBER_AI_CREDIT';
    if (!numeric && values.kind !== 'SET') issue('kind', 'kind');
    if (numeric && values.kind !== 'UNLIMITED') {
      const number = Number(values.valueText.trim().replace(',', '.'));
      if (
        !values.valueText.trim() ||
        !Number.isFinite(number) ||
        (values.kind === 'ADD' ? number <= 0 : number < 0)
      )
        issue('valueText', 'value');
    }
    if (
      values.entitlementType === 'CONFIG' &&
      readExceptionConfig(values.jsonValue) === null
    )
      issue('jsonValue', 'json');
    const start = values.startsAt
      ? dateTimeInputToInstant(values.startsAt)
      : null;
    const end = values.endsAt ? dateTimeInputToInstant(values.endsAt) : null;
    if (values.startsAt && !start) issue('startsAt', 'date');
    if (
      values.endsAt &&
      (!end ||
        Date.parse(end) <= Date.now() ||
        Date.parse(end) <= (start ? Date.parse(start) : Date.now()))
    )
      issue('endsAt', 'window');
  });

export type ExceptionFormValues = z.infer<typeof exceptionFormSchema>;
export const exceptionDefaults: ExceptionFormValues = {
  entitlementSlug: '',
  entitlementType: 'NUMBER',
  kind: 'SET',
  reason: '',
  startsAt: '',
  endsAt: '',
  valueText: '',
  booleanValue: false,
  jsonValue: '{}',
};

export function exceptionToBody(
  values: ExceptionFormValues,
): NewEntitlementException {
  const parsed = exceptionFormSchema.parse(values);
  const value =
    parsed.kind === 'UNLIMITED'
      ? undefined
      : parsed.entitlementType === 'BOOLEAN'
        ? parsed.booleanValue
        : parsed.entitlementType === 'CONFIG'
          ? readExceptionConfig(parsed.jsonValue)
          : Number(parsed.valueText.trim().replace(',', '.'));
  return zNewEntitlementException.parse({
    entitlementSlug: parsed.entitlementSlug,
    kind: parsed.kind,
    reason: parsed.reason,
    startsAt: dateTimeInputToInstant(parsed.startsAt) ?? undefined,
    endsAt: dateTimeInputToInstant(parsed.endsAt) ?? undefined,
    ...(value === undefined ? {} : { value }),
  });
}

/** SET may lower an effective NUMBER, including unlimited, or disable a BOOLEAN. */
export function exceptionLowersValue(
  values: ExceptionFormValues,
  current: { type: string; value: unknown } | null | undefined,
): boolean {
  if (values.kind !== 'SET' || !current) return false;
  if (current.type === 'boolean')
    return current.value === true && !values.booleanValue;
  const replacement = Number(values.valueText.trim().replace(',', '.'));
  return (
    current.type === 'number' &&
    typeof current.value === 'number' &&
    values.valueText.trim() !== '' &&
    Number.isFinite(replacement) &&
    replacement >= 0 &&
    (current.value === -1 || replacement < current.value)
  );
}

/** The conflict id is read only from its documented Problem member, never from prose. */
export function overlapExceptionId(error: unknown): string | null {
  const problem = error as {
    data?: { errors?: Array<{ value?: { exceptionId?: unknown } }> };
    errors?: Array<{ value?: { exceptionId?: unknown } }>;
  } | null;
  const errors = problem?.data?.errors ?? problem?.errors;
  const id = errors?.[0]?.value?.exceptionId;
  return typeof id === 'string' ? id : null;
}
