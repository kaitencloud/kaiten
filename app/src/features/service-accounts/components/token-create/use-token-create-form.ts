import { useAppForm } from '@/hooks/form';
import type { TokenCreateData } from '../../types';
import { accessLevelsToScopes } from '../../utils/access-levels';
import {
  type TokenCreateFormValues,
  tokenCreateSchema,
} from './token-create.schema';

const DEFAULT_VALUES: TokenCreateFormValues = {
  name: '',
  expiresAt: '',
  access: {},
};

export function useTokenCreateForm(
  onSubmit: (data: TokenCreateData) => Promise<unknown>,
) {
  return useAppForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onChange: tokenCreateSchema },
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name.trim(),
        scopes: accessLevelsToScopes(value.access),
        expiresAt: value.expiresAt || undefined,
      });
    },
  });
}

export type TokenCreateFormApi = ReturnType<typeof useTokenCreateForm>;
