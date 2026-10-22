import { useStore } from '@tanstack/react-store';
import { Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ManagedUser } from '@/api-client';
import { Button } from '@/components/ui/button';
import { DialogFormSkeleton } from '@/components/dialog/dialog-form-skeleton';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { profileSchema, accessErrorMessage } from '../access-helpers';
import { useAccessMutations } from '../user-management.queries';
import { FormFeedback } from './form-feedback';

export function ProfileForm({
  user,
  onStateChange,
}: {
  user: ManagedUser;
  onStateChange: (dirty: boolean, pending: boolean) => void;
}) {
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
        form.reset(value);
        toast.success(t('Pages.Access.profileSaved'));
      } catch (cause) {
        setError(accessErrorMessage(cause, t));
      }
    },
  });
  const dirty = useStore(form.store, (state) => state.isDirty);
  useEffect(() => {
    onStateChange(dirty, profile.isPending);
  }, [dirty, profile.isPending, onStateChange]);
  return (
    <form
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
      className="space-y-4"
    >
      <form.AppForm>
        <Suspense fallback={<DialogFormSkeleton fields={2} />}>
          <FormFeedback error={error} />
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
                required
                type="email"
                inputMode="email"
                autoComplete="email"
                disabled={profile.isPending}
              />
            )}
          </form.AppField>
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
