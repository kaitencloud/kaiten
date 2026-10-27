import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { revokeEntitlementExceptionMutation } from '@/api-client/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { ProblemAlert, useGrantedScopes } from '@/domains/billing';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { useSingleFlightMutate } from '@/hooks/use-single-flight';
import { OPERATION_SCOPES } from '@/lib/api/operation-scopes.gen';
import { hasScope } from '@/lib/granted-scopes';
import { useInstanceDetail } from '../components/instance-detail/instance-detail-context';
import {
  entitlementExceptionsQueryOptions,
  invalidateEntitlementExceptions,
} from './exception-query-options';

export function EndExceptionDialog({
  exceptionId,
  onClose,
}: {
  exceptionId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const access = useGrantedScopes();
  const queryClient = useQueryClient();
  const allowed =
    !access.isPending &&
    OPERATION_SCOPES.revokeEntitlementException.every((scope) =>
      hasScope(access.scopes, scope),
    );
  const exceptions = useQuery({
    ...entitlementExceptionsQueryOptions(instanceSlug),
    enabled:
      !access.isPending &&
      OPERATION_SCOPES.listEntitlementExceptions.every((scope) =>
        hasScope(access.scopes, scope),
      ),
  });
  const exception = exceptions.data?.find((row) => row.id === exceptionId);
  const mutation = useMutation({
    ...revokeEntitlementExceptionMutation(),
    onSuccess: async () => {
      await invalidateEntitlementExceptions(queryClient, instanceSlug);
      onClose();
    },
  });
  const end = useSingleFlightMutate(mutation.mutateAsync);
  const KEY = 'Pages.EntitlementExceptions';
  return (
    <StackedFormDialog
      open
      confirmOnClose={false}
      title={t(`${KEY}.endTitle`)}
      description={t(`${KEY}.endDescription`)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <StackedFormDialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('Common.cancel')}
        </Button>
        <Button
          variant="destructive"
          disabled={
            !allowed ||
            !exception ||
            mutation.isPending ||
            !['ACTIVE', 'SCHEDULED'].includes(exception.status)
          }
          onClick={() => end({ path: { instanceSlug, exceptionId } })}
        >
          {t(`${KEY}.end`)}
        </Button>
      </StackedFormDialogFooter>
      <StackedFormDialogPanel>
        {!allowed ? (
          <p>{t(`${KEY}.forbidden`)}</p>
        ) : exceptions.isPending ? (
          <p>{t(`${KEY}.loading`)}</p>
        ) : exceptions.isError ? (
          <ProblemAlert
            error={exceptions.error}
            onRetry={() => void exceptions.refetch()}
          />
        ) : exception ? (
          <p>
            {exception.entitlementSlug}: {exception.reason}
          </p>
        ) : (
          <p role="alert">{t(`${KEY}.notFound`)}</p>
        )}
        {mutation.isError && <ProblemAlert error={mutation.error} />}
      </StackedFormDialogPanel>
    </StackedFormDialog>
  );
}
