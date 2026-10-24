import { z } from 'zod';
import { defineFormRecovery } from '@/functionals/form-recovery';
import { type LicenseFormValues, licenseFormSchema } from '../../schemas';
import type { EditableLicenseEntitlement } from '../../utils';

/** A grant row of the new license, as the draft store holds it. */
const draftEntitlementSchema = z.object({
  configValue: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().nullable(),
  entitlementIcon: z.string().nullable().optional(),
  entitlementId: z.string().nullable(),
  entitlementName: z.string(),
  entitlementType: z.enum(['BOOLEAN', 'NUMBER', 'CONFIG']),
  limitCapExceededOveragePercent: z.number().nullable(),
  threshold: z.number().nullable(),
}) satisfies z.ZodType<EditableLicenseEntitlement>;

const FORM = 'Pages.Licenses.Mutation.Form';

/**
 * What the creation of a license keeps when it is left unsent: its fields, and the
 * entitlements it grants, which live outside the form in the draft store (`extra`,
 * written only once a row was added or changed). Nothing here is a secret, a code
 * entered once or a person's data, so `omit` is empty. One long page: no steps.
 * "Create as draft" is a send like any other: the server draft takes over. The edit
 * of a license keeps nothing.
 */
export const licenseRecovery = defineFormRecovery<
  LicenseFormValues,
  void,
  EditableLicenseEntitlement[]
>({
  formId: 'licenses.create',
  version: 1,
  omit: [],
  schema: licenseFormSchema,
  extraSchema: z.array(draftEntitlementSchema),
  fieldLabels: {
    createAsDraft: { key: `${FORM}.Labels.createAsDraft` },
    description: { key: `${FORM}.Labels.description` },
    name: { key: `${FORM}.Labels.name` },
    slug: { key: `${FORM}.Labels.slug` },
    type: { key: `${FORM}.Labels.type` },
    versionName: { key: `${FORM}.Labels.versionName` },
  },
});

/**
 * The grant rows of a resumed creation that still name an entitlement of the catalog:
 * one deleted since would make the license stay a draft at its creation.
 */
export function keepGrantableRows(
  rows: readonly EditableLicenseEntitlement[] | undefined,
  entitlementIds: ReadonlySet<string>,
): EditableLicenseEntitlement[] {
  return (rows ?? []).filter(
    (row) => row.entitlementId !== null && entitlementIds.has(row.entitlementId),
  );
}
