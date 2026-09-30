import { z } from 'zod';
import { zPlainTokenWritable } from '@/api-client/zod.gen';
import {
  API_SCOPE_PERMISSIONS,
  API_SCOPE_RESOURCES,
} from '@/lib/api/scopes.gen';

const I18N = 'Pages.Integrations.ServiceAccounts.NewToken';

const baseTokenSchema = zPlainTokenWritable.pick({
  expiresAt: true,
  name: true,
});

// The table's state: a level per resource, absent for no access. The scopes are
// derived from it on submit (accessLevelsToScopes), never edited directly.
const accessLevelsSchema = z
  .partialRecord(z.enum(API_SCOPE_RESOURCES), z.enum(API_SCOPE_PERMISSIONS))
  .refine((levels) => Object.keys(levels).length > 0, {
    message: `${I18N}.Access.accessRequired`,
  });

export const tokenCreateSchema = baseTokenSchema.extend({
  name: baseTokenSchema.shape.name
    .trim()
    .min(1, { message: `${I18N}.Details.nameRequired` }),
  expiresAt: z
    .union([z.literal(''), baseTokenSchema.shape.expiresAt])
    .optional(),
  access: accessLevelsSchema,
});

export type TokenCreateFormValues = z.input<typeof tokenCreateSchema>;
