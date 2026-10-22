import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { roleSchema, accessErrorMessage } from '../access-helpers';
import { useAccessMutations } from '../user-management.queries';
import type { Role } from '../user-management.api';
import { PermissionMatrix } from './permission-matrix';
import { AccessConfirmation } from './access-confirmation';
import { DialogFormSkeleton } from '@/components/dialog/dialog-form-skeleton';
import { FormFeedback } from './form-feedback';

export function RoleEditor({
  role,
  available,
  assignedCount,
  onClose,
  canWrite = true,
  grantablePermissions = available,
}: {
  role?: Role;
  available: string[];
  assignedCount: number;
  onClose: () => void;
  canWrite?: boolean;
  grantablePermissions?: string[];
}) {
  const { t } = useTranslation();
  const mutations = useAccessMutations();
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [discard, setDiscard] = useState(false);
  const readOnly = Boolean(role?.builtIn) || !canWrite;
  const pending = mutations.role.isPending || mutations.deleteRole.isPending;
  const form = useAppForm({
    defaultValues: {
      slug: role?.slug ?? '',
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissions: role?.permissions ?? [],
    },
    validators: { onChange: roleSchema },
    onSubmit: async ({ value }) => {
      if (readOnly) return;
      setError('');
      try {
        await mutations.role.mutateAsync({ body: value, slug: role?.slug });
        toast.success(t('Pages.Access.roleSaved'));
        onClose();
      } catch (cause) {
        setError(accessErrorMessage(cause, t));
      }
    },
  });
  function close() {
    if (pending) return;
    if (form.state.isDirty) {
      setDiscard(true);
      return;
    }
    onClose();
  }
  async function remove() {
    if (!role || readOnly) return;
    setError('');
    try {
      await mutations.deleteRole.mutateAsync(role.slug);
      toast.success(t('Pages.Access.roleDeleted'));
      onClose();
    } catch (cause) {
      setError(accessErrorMessage(cause, t));
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        variant="form"
        className="sm:max-w-2xl motion-reduce:animate-none motion-reduce:transition-none"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>
            {t(role ? 'Pages.Access.editRole' : 'Pages.Access.createRole')}
          </DialogTitle>
          <DialogDescription>
            {t('Pages.Access.roleEditorDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={createFormSubmitHandler(form.handleSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <form.AppForm>
            <Suspense
              fallback={<DialogFormSkeleton fields={3} className="p-6" />}
            >
              <DialogBody className="space-y-4">
                <FormFeedback error={!confirmDelete ? error : ''} />
                {readOnly && (
                  <p className="rounded-md bg-muted p-3 text-sm">
                    {t(
                      role?.builtIn
                        ? 'Pages.Access.builtInExplanation'
                        : 'Pages.Access.readOnlyAccess',
                    )}
                  </p>
                )}
                <div className="space-y-4">
                  <form.AppField name="name">
                    {(field) => (
                      <field.TextField
                        label={t('Pages.Access.name')}
                        required
                        disabled={readOnly || pending}
                      />
                    )}
                  </form.AppField>
                  {role ? (
                    <div className="rounded-md bg-muted/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        {t('Pages.Access.slug')}
                      </p>
                      <p className="mt-1 font-mono text-sm break-all">
                        {role.slug}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('Pages.Access.slugExplanation')}
                      </p>
                    </div>
                  ) : (
                    <form.AppField name="slug">
                      {(field) => (
                        <field.TextField
                          label={t('Pages.Access.slug')}
                          required
                          disabled={pending}
                          description={t('Pages.Access.slugExplanation')}
                        />
                      )}
                    </form.AppField>
                  )}
                </div>
                <form.AppField name="description">
                  {(field) => (
                    <field.TextAreaField
                      label={t('Pages.Access.description')}
                      disabled={readOnly || pending}
                    />
                  )}
                </form.AppField>
                <div>
                  <h3 className="text-sm font-semibold">
                    {t('Pages.Access.permissions')}
                  </h3>
                  <p className="mb-3 mt-1 text-xs text-muted-foreground">
                    {t(
                      role?.isAdministrator
                        ? 'Pages.Access.adminExplanation'
                        : 'Pages.Access.rolePermissionsExplanation',
                    )}
                  </p>
                  <form.AppField name="permissions">
                    {(field) => (
                      <PermissionMatrix
                        permissions={field.state.value}
                        available={readOnly ? available : grantablePermissions}
                        disabled={readOnly || pending}
                        onChange={field.handleChange}
                      />
                    )}
                  </form.AppField>
                </div>
                {!readOnly && role && (
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-xs text-muted-foreground">
                      {t('Pages.Access.deleteRoleExplanation', {
                        count: assignedCount,
                      })}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={pending || assignedCount > 0}
                      onClick={() => setConfirmDelete(true)}
                    >
                      {t('Pages.Access.deleteRole')}
                    </Button>
                  </div>
                )}
              </DialogBody>
              <DialogFooter>
                {role && !readOnly && (
                  <p className="mr-auto text-xs text-muted-foreground">
                    {t('Pages.Access.roleSaveImpact', { count: assignedCount })}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={close}
                >
                  {t('Common.cancel')}
                </Button>
                {!readOnly && (
                  <form.Subscribe selector={(state) => state.canSubmit}>
                    {(canSubmit) => (
                      <Button type="submit" disabled={!canSubmit || pending}>
                        {t(pending ? 'Pages.Access.saving' : 'Common.save')}
                      </Button>
                    )}
                  </form.Subscribe>
                )}
              </DialogFooter>
            </Suspense>
          </form.AppForm>
        </form>
        <AccessConfirmation
          destructive
          confirmLabel={t('Pages.Access.deleteRole')}
          open={confirmDelete}
          pending={pending}
          error={error}
          title={t('Pages.Access.confirmDeleteRole')}
          description={t('Pages.Access.deleteRoleImpact', { name: role?.name })}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
        />
        <AccessConfirmation
          open={discard}
          pending={pending}
          title={t('Pages.Access.discardChanges')}
          description={t('Pages.Access.discardDescription')}
          confirmLabel={t('Pages.Access.discard')}
          destructive
          onCancel={() => setDiscard(false)}
          onConfirm={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
