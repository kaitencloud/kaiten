import { Button } from '@/components/ui/button';
import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { generateSlug } from '@/functionals/slug';
import { createFormSubmitHandler } from '@/hooks/form';
import { useComponentForm } from '../hooks';
import { componentFormSchema } from '../schemas';
import type { ComponentFormProps } from '../types';

type ComponentFormDialogProps = ComponentFormProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ComponentFormDialog({
  componentSlug,
  initialValues,
  mode = 'create',
  onOpenChange,
  onSuccess,
  open,
}: ComponentFormDialogProps) {
  const { t } = useTranslation();
  const { form, isLoading } = useComponentForm({
    componentSlug,
    initialValues,
    mode,
    onSuccess: (component) => {
      onSuccess?.(component);
      onOpenChange(false);
    },
  });

  const title =
    mode === 'edit'
      ? t('Pages.Releases.Components.Form.titleEdit')
      : t('Pages.Releases.Components.Form.titleCreate');

  return (
    <StackedFormDialog
      confirmOnClose={false}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
    >
      <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
        <form.AppForm>
          <StackedFormDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t('Common.cancel')}
            </Button>
            <form.Subscribe<{
              disabled: boolean;
              isSubmitting: boolean;
            }>
              selector={(state) => {
                const parsed = componentFormSchema.safeParse(state.values);
                const invalid = !parsed.success;
                const disabled =
                  state.isValidating ||
                  state.isSubmitting ||
                  invalid ||
                  (mode === 'edit' && !state.isDirty);
                return {
                  disabled,
                  isSubmitting: state.isSubmitting,
                };
              }}
            >
              {({ disabled, isSubmitting }) => (
                <Button
                  type="button"
                  disabled={disabled || isLoading}
                  onClick={() => {
                    void form.handleSubmit();
                  }}
                >
                  {isSubmitting && (
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                  )}
                  {mode === 'edit' ? t('Common.save') : t('Common.create')}
                </Button>
              )}
            </form.Subscribe>
          </StackedFormDialogFooter>
          <StackedFormDialogPanel>
            <div className="space-y-6">
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    label={t('Pages.Releases.Components.Form.Labels.name')}
                    placeholder={t(
                      'Pages.Releases.Components.Form.Placeholders.name',
                    )}
                    description={t(
                      'Pages.Releases.Components.Form.Descriptions.name',
                    )}
                    onChange={(value) =>
                      form.setFieldValue('slug', generateSlug(value))
                    }
                  />
                )}
              </form.AppField>

              <form.AppField name="slug">
                {(field) => (
                  <field.TextField
                    label={t('Pages.Releases.Components.Form.Labels.slug')}
                    placeholder={t(
                      'Pages.Releases.Components.Form.Placeholders.slug',
                    )}
                    description={t(
                      'Pages.Releases.Components.Form.Descriptions.slug',
                    )}
                  />
                )}
              </form.AppField>

              <form.AppField name="version">
                {(field) => (
                  <field.TextField
                    label={t('Pages.Releases.Components.Form.Labels.version')}
                    placeholder={t(
                      'Pages.Releases.Components.Form.Placeholders.version',
                    )}
                    description={t(
                      'Pages.Releases.Components.Form.Descriptions.version',
                    )}
                  />
                )}
              </form.AppField>

              <form.AppField name="description">
                {(field) => (
                  <field.TextAreaField
                    label={t(
                      'Pages.Releases.Components.Form.Labels.description',
                    )}
                    placeholder={t(
                      'Pages.Releases.Components.Form.Placeholders.description',
                    )}
                    description={t(
                      'Pages.Releases.Components.Form.Descriptions.description',
                    )}
                  />
                )}
              </form.AppField>
            </div>
          </StackedFormDialogPanel>
        </form.AppForm>
      </form>
    </StackedFormDialog>
  );
}
