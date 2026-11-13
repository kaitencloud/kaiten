import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getEntitlementsUsageMetricsOptions } from '@/api-client/@tanstack/react-query.gen';
import { ProblemAlert, useGrantedScopes } from '@/domains/billing';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { OPERATION_SCOPES } from '@/lib/api/operation-scopes.gen';
import { hasScope } from '@/lib/granted-scopes';
import { useInstanceDetail } from '../components/instance-detail/instance-detail-context';
import { ExceptionFields } from './exception-fields';
import { useExceptionForm } from './use-exception-form';

export function CreateExceptionDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { instance, entitlements } = useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const access = useGrantedScopes();
  const formId = useId();
  const { form, failure, conflictId } = useExceptionForm(
    instanceSlug,
    onClose,
    entitlements,
  );
  const current = useQuery(
    getEntitlementsUsageMetricsOptions({ path: { instanceSlug } }),
  );
  const allowed =
    !access.isPending &&
    OPERATION_SCOPES.createEntitlementException.every((scope) =>
      hasScope(access.scopes, scope),
    );
  const KEY = 'Pages.EntitlementExceptions';
  return (
    <StackedFormDialog
      open
      title={t(`${KEY}.create`)}
      description={t(`${KEY}.description`)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
        <form.AppForm>
          <StackedFormDialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('Common.cancel')}
            </Button>
            {allowed && (
              <form.SubmitButton form={formId} label={t(`${KEY}.save`)} />
            )}
          </StackedFormDialogFooter>
          <StackedFormDialogPanel>
            <div className="space-y-4">
              {!allowed ? (
                <p role="status">{t(`${KEY}.forbidden`)}</p>
              ) : (
                <ExceptionFields
                  form={form}
                  entitlements={entitlements}
                  current={current.data ?? []}
                />
              )}
              {failure ? <ProblemAlert error={failure} /> : null}
              {conflictId && (
                <div role="alert">
                  <p>{t(`${KEY}.overlap`)}</p>
                  <Link
                    to="/customers/instances/$instanceSlug/entitlements/exceptions/$exceptionId/revoke"
                    params={{ instanceSlug, exceptionId: conflictId }}
                  >
                    {t(`${KEY}.openOverlap`)}
                  </Link>
                </div>
              )}
            </div>
          </StackedFormDialogPanel>
        </form.AppForm>
      </form>
    </StackedFormDialog>
  );
}
