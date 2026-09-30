import { Button } from '@/components/ui/button';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { zServiceAccountWritable } from '@/api-client/zod.gen';
import { DialogFormSkeleton } from '@/components/dialog/dialog-form-skeleton';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';

const createServiceAccountSchema = zServiceAccountWritable
  .pick({
    name: true,
  })
  .extend({
    name: zServiceAccountWritable.shape.name.min(1, {
      message: 'Pages.Integrations.ServiceAccounts.Dialog.nameRequired',
    }),
  });

type CreateServiceAccountFormValues = z.infer<
  typeof createServiceAccountSchema
>;

interface CreateServiceAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
  isPending?: boolean;
}

export function CreateServiceAccountDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateServiceAccountDialogProps) {
  const { t } = useTranslation();

  const form = useAppForm({
    defaultValues: {
      name: '',
    } as CreateServiceAccountFormValues,
    validators: {
      onChange: createServiceAccountSchema,
    },
    onSubmit: async ({ value }) => {
      onSubmit(value.name);
      onOpenChange(false);
    },
  });

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent variant="form">
        <DialogHeader>
          <DialogTitle>
            {t('Pages.Integrations.ServiceAccounts.Dialog.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('Pages.Integrations.ServiceAccounts.Dialog.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={createFormSubmitHandler(form.handleSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <form.AppForm>
            <DialogBody className="space-y-6">
              <Suspense fallback={<DialogFormSkeleton fields={1} />}>
                <form.AppField name="name">
                  {(field) => (
                    <field.TextField
                      label={t(
                        'Pages.Integrations.ServiceAccounts.Dialog.nameLabel',
                      )}
                      required
                      placeholder={t(
                        'Pages.Integrations.ServiceAccounts.Dialog.namePlaceholder',
                      )}
                      description={t(
                        'Pages.Integrations.ServiceAccounts.Dialog.nameDescription',
                      )}
                    />
                  )}
                </form.AppField>
              </Suspense>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('Common.cancel')}
              </Button>
              <Suspense fallback={null}>
                <form.SubmitButton
                  label={t(
                    'Pages.Integrations.ServiceAccounts.Dialog.createButton',
                  )}
                />
              </Suspense>
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  );
}
