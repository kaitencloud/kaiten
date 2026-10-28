import { assertAiRequestAllowed, isAiEntitlement } from '@/domains/ai-credits';
import type { Entitlement } from '@/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { createEntitlementExceptionMutation } from '@/api-client/@tanstack/react-query.gen';
import {
  clearProblemFieldError,
  setProblemFieldError,
  getProblemCode,
} from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import {
  exceptionDefaults,
  exceptionFormSchema,
  exceptionToBody,
  overlapExceptionId,
} from './exception.schema';
import { invalidateEntitlementExceptions } from './exception-query-options';

export function useExceptionForm(
  instanceSlug: string,
  onSaved: () => void,
  entitlements: readonly Entitlement[],
) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<unknown>(null);
  const [conflictId, setConflictId] = useState<string | null>(null);
  const refused = useRef<string | null>(null);
  const mutation = useMutation({
    ...createEntitlementExceptionMutation(),
    onSuccess: () => invalidateEntitlementExceptions(queryClient, instanceSlug),
  });
  const form = useAppForm({
    defaultValues: exceptionDefaults,
    validators: { onChange: exceptionFormSchema },
    listeners: {
      onChange: ({ formApi }) => {
        if (refused.current) {
          clearProblemFieldError(formApi, refused.current);
          refused.current = null;
        }
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setFailure(null);
      setConflictId(null);
      try {
        const target = entitlements.find(
          (item) => item.slug === value.entitlementSlug,
        );
        if (isAiEntitlement(target?.type ?? value.entitlementType))
          assertAiRequestAllowed(queryClient);
        await mutation.mutateAsync({
          path: { instanceSlug },
          body: exceptionToBody(value),
        });
        onSaved();
      } catch (error) {
        const code = getProblemCode(error)?.split('.').at(-1);
        const fields = {
          InvalidValue: 'valueText',
          InvalidKind: 'kind',
          InvalidWindow: 'endsAt',
          ReasonRequired: 'reason',
          EntitlementNotFound: 'entitlementSlug',
        } as const;
        const field =
          code && code in fields ? fields[code as keyof typeof fields] : null;
        if (field) {
          const target =
            field === 'valueText'
              ? value.entitlementType === 'CONFIG'
                ? 'jsonValue'
                : value.entitlementType === 'BOOLEAN'
                  ? 'booleanValue'
                  : field
              : field;
          refused.current = target;
          setProblemFieldError(
            formApi,
            target,
            `Pages.EntitlementExceptions.refusals.${code}`,
          );
        } else if (code !== 'Overlap') setFailure(error);
        if (code === 'Overlap') {
          setConflictId(overlapExceptionId(error));
          await invalidateEntitlementExceptions(queryClient, instanceSlug);
        }
      }
    },
  });
  return { form, failure, conflictId };
}
