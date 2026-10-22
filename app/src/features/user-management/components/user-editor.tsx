import { useStore } from '@tanstack/react-store';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ManagedUser } from '@/api-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { accessErrorMessage } from '../access-helpers';
import { useAccessMutations } from '../user-management.queries';
import type { Role } from '../user-management.api';
import { PermissionMatrix } from './permission-matrix';
import { AccessConfirmation } from './access-confirmation';
import { UserStatus } from './user-status';
import { AccessSummary } from './access-summary';
import { ProfileForm } from './profile-form';
import { useIsMutating } from '@tanstack/react-query';

function UserAccessForm({
  user,
  roles,
  available,
  currentId,
  onStateChange,
}: {
  user: ManagedUser;
  roles: Role[];
  available: string[];
  currentId?: string;
  onStateChange: (dirty: boolean, pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const { authorization } = useAccessMutations();
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const form = useAppForm({
    defaultValues: {
      ...user.authorization,
      roles: [...user.authorization.roles],
      permissions: [...user.authorization.permissions],
    },
    onSubmit: async () => {
      setConfirm(true);
    },
  });
  const pending = authorization.isPending;
  const dirty = useStore(form.store, (state) => state.isDirty);
  useEffect(() => {
    onStateChange(dirty, pending);
  }, [dirty, pending, onStateChange]);
  async function save() {
    setError('');
    try {
      await authorization.mutateAsync({
        path: { id: user.id },
        body: {
          roles: form.state.values.roles,
          permissions: form.state.values.permissions,
        },
      });
      form.reset({ ...form.state.values });
      setConfirm(false);
      toast.success(t('Pages.Access.accessSaved'));
    } catch (cause) {
      setError(accessErrorMessage(cause, t));
    }
  }
  function renderRole(role: Role) {
    return (
      <form.AppField key={role.slug} name="roles">
        {(field) => (
          <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={field.state.value.includes(role.slug)}
              disabled={pending}
              onCheckedChange={(checked) =>
                field.handleChange(
                  checked
                    ? [...field.state.value, role.slug]
                    : field.state.value.filter((slug) => slug !== role.slug),
                )
              }
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {role.name}
                {role.isAdministrator && (
                  <Badge>{t('Pages.Access.administrator')}</Badge>
                )}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {role.description}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {role.isAdministrator
                  ? t('Pages.Access.fullAdministrator')
                  : t('Pages.Access.scopeCount', {
                      count: role.permissions.length,
                    })}
              </span>
            </span>
          </Label>
        )}
      </form.AppField>
    );
  }
  return (
    <form
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
      className="space-y-4 border-t pt-6"
    >
      <form.AppForm>
        <div>
          <h3 className="text-sm font-semibold">{t('Pages.Access.access')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('Pages.Access.adminExplanation')}
          </p>
        </div>
        {user.id === currentId && (
          <p className="text-xs text-muted-foreground">
            {t('Pages.Access.selfProtection')}
          </p>
        )}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground">
            {t('Pages.Access.roles')}
          </h4>
          {roles.map(renderRole)}
        </div>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t('Pages.Access.scopeOverrides')}
          </summary>
          <p className="my-3 text-xs text-muted-foreground">
            {t('Pages.Access.overridesExplanation')}
          </p>
          <form.AppField name="permissions">
            {(field) => (
              <PermissionMatrix
                permissions={field.state.value}
                available={available}
                disabled={pending}
                onChange={field.handleChange}
              />
            )}
          </form.AppField>
        </details>
        <form.Subscribe selector={(state) => state.values}>
          {(values) => (
            <>
              <AccessSummary
                slugs={values.roles}
                permissions={values.permissions}
                roles={roles}
                available={available}
              />
              <Button type="submit" disabled={pending}>
                {t(pending ? 'Pages.Access.saving' : 'Pages.Access.saveAccess')}
              </Button>
              <AccessConfirmation
                open={confirm}
                pending={pending}
                error={error}
                confirmLabel={t('Pages.Access.saveAccess')}
                title={t('Pages.Access.confirmAccess')}
                description={t('Pages.Access.accessImpact', {
                  name: user.name,
                })}
                onCancel={() => setConfirm(false)}
                onConfirm={() => void save()}
              >
                <div className="text-sm space-y-2">
                  <p>
                    {t('Pages.Access.rolesAdded')}:{' '}
                    {values.roles
                      .filter(
                        (slug) => !user.authorization.roles.includes(slug),
                      )
                      .map(
                        (slug) =>
                          roles.find((role) => role.slug === slug)?.name ??
                          slug,
                      )
                      .join(', ') || t('Pages.Access.levels.none')}
                  </p>
                  <p>
                    {t('Pages.Access.rolesRemoved')}:{' '}
                    {user.authorization.roles
                      .filter((slug) => !values.roles.includes(slug))
                      .map(
                        (slug) =>
                          roles.find((role) => role.slug === slug)?.name ??
                          slug,
                      )
                      .join(', ') || t('Pages.Access.levels.none')}
                  </p>
                  <p>
                    {t('Pages.Access.directScopesChanged', {
                      added: values.permissions.filter(
                        (scope) =>
                          !user.authorization.permissions.includes(scope),
                      ).length,
                      removed: user.authorization.permissions.filter(
                        (scope) => !values.permissions.includes(scope),
                      ).length,
                    })}
                  </p>
                </div>
              </AccessConfirmation>
            </>
          )}
        </form.Subscribe>
      </form.AppForm>
    </form>
  );
}

export function UserEditor({
  user,
  roles,
  available,
  currentId,
  onClose,
}: {
  user: ManagedUser;
  roles: Role[];
  available: string[];
  currentId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [profileState, setProfileState] = useState({
    dirty: false,
    pending: false,
  });
  const [accessState, setAccessState] = useState({
    dirty: false,
    pending: false,
  });
  const [discard, setDiscard] = useState(false);
  const profileChange = useCallback(
    (dirty: boolean, pending: boolean) => setProfileState({ dirty, pending }),
    [],
  );
  const accessChange = useCallback(
    (dirty: boolean, pending: boolean) => setAccessState({ dirty, pending }),
    [],
  );
  const inFlight = useIsMutating({ mutationKey: ['access-management'] });
  const pending = profileState.pending || accessState.pending || inFlight > 0;
  function close() {
    if (pending) return;
    if (profileState.dirty || accessState.dirty) {
      setDiscard(true);
      return;
    }
    onClose();
  }
  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent
        className="w-full sm:max-w-xl motion-reduce:animate-none motion-reduce:transition-none"
        showCloseButton={false}
      >
        <SheetHeader className="border-b p-6">
          <SheetTitle>{user.name}</SheetTitle>
          <SheetDescription>
            {t('Pages.Access.userEditorDescription')}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6">
          <div className="rounded-md bg-muted px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              {t('Pages.Access.identity')}{' '}
            </span>
            <span className="break-all font-mono">{user.externalId}</span>
          </div>
          <ProfileForm user={user} onStateChange={profileChange} />
          <UserStatus user={user} currentId={currentId} />
          <UserAccessForm
            user={user}
            roles={roles}
            available={available}
            currentId={currentId}
            onStateChange={accessChange}
          />
        </div>
        <div className="border-t px-6 py-4">
          <Button variant="outline" disabled={pending} onClick={close}>
            {t('Common.close')}
          </Button>
        </div>
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
      </SheetContent>
    </Sheet>
  );
}
