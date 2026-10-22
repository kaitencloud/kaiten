import { Suspense, useState } from 'react';
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
import {
  profileSchema,
  effectivePermissions,
  accessErrorMessage,
} from '../access-helpers';
import { useAccessMutations } from '../user-management.queries';
import type { Role } from '../user-management.api';
import { PermissionMatrix } from './permission-matrix';
import { AccessConfirmation } from './access-confirmation';
import { UserStatus } from './user-status';

function ProfileForm({ user }: { user: ManagedUser }) {
  const { t } = useTranslation();
  const { profile } = useAccessMutations();
  const [error, setError] = useState('');
  const form = useAppForm({
    defaultValues: { name: user.name, email: user.email ?? '' },
    validators: { onChange: profileSchema },
    onSubmit: async ({ value }) => {
      setError('');
      try {
        await profile.mutateAsync({
          path: { id: user.id },
          body: value,
        });
        toast.success(t('Pages.Access.profileSaved'));
      } catch (cause) {
        setError(accessErrorMessage(cause, t));
      }
    },
  });
  return (
    <form
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
      className="space-y-4"
    >
      <form.AppForm>
        <Suspense fallback={null}>
          <h3 className="text-sm font-semibold">{t('Pages.Access.profile')}</h3>
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label={t('Pages.Access.name')}
                required
                disabled={profile.isPending}
              />
            )}
          </form.AppField>
          <form.AppField name="email">
            {(field) => (
              <field.TextField
                label={t('Pages.Access.email')}
                disabled={profile.isPending}
              />
            )}
          </form.AppField>
          {error && (
            <p
              role="alert"
              className="text-sm text-destructive-subtle-foreground"
            >
              {error}
            </p>
          )}
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button
                type="submit"
                variant="outline"
                disabled={!canSubmit || profile.isPending}
              >
                {t(
                  profile.isPending
                    ? 'Pages.Access.saving'
                    : 'Pages.Access.saveProfile',
                )}
              </Button>
            )}
          </form.Subscribe>
        </Suspense>
      </form.AppForm>
    </form>
  );
}

function UserAccessForm({
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
      toast.success(t('Pages.Access.accessSaved'));
      onClose();
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
                {t('Pages.Access.scopeCount', {
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
              <p className="text-xs text-muted-foreground">
                {t('Pages.Access.effectiveScopes', {
                  count: effectivePermissions(
                    values.roles,
                    values.permissions,
                    roles,
                  ).length,
                })}
              </p>
              <Button type="submit" disabled={pending}>
                {t(pending ? 'Pages.Access.saving' : 'Pages.Access.saveAccess')}
              </Button>
              <AccessConfirmation
                open={confirm}
                pending={pending}
                error={error}
                title={t(
                  values.enabled === user.authorization.enabled
                    ? 'Pages.Access.confirmAccess'
                    : values.enabled
                      ? 'Pages.Access.confirmEnable'
                      : 'Pages.Access.confirmDisable',
                )}
                description={t(
                  values.enabled
                    ? 'Pages.Access.accessImpact'
                    : 'Pages.Access.disableImpact',
                  { name: user.name },
                )}
                onCancel={() => setConfirm(false)}
                onConfirm={() => void save()}
              />
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

  function close() {
    onClose();
  }
  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent className="w-full sm:max-w-xl" showCloseButton={false}>
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
          <ProfileForm user={user} />
          <UserStatus user={user} currentId={currentId} />
          <UserAccessForm
            user={user}
            roles={roles}
            available={available}
            currentId={currentId}
            onClose={onClose}
          />
        </div>
        <div className="border-t px-6 py-4">
          <Button variant="outline" onClick={close}>
            {t('Common.close')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
