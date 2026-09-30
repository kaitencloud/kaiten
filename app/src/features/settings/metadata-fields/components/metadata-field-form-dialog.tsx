import { Button } from '@/components/ui/button';
import { Code2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import type {
  DialogMode,
  MetadataFieldSubmitPayload,
} from '../metadata-field-helpers';
import type {
  MetadataFieldFormValues,
  MetadataResourceType,
  MetadataSettingsField,
} from '../types';
import { useMetadataFieldForm } from '../use-metadata-field-form';
import {
  IdentityFields,
  RawSchemaField,
  SchemaFields,
} from './metadata-field-form-fields';

type MetadataFieldFormDialogProps = {
  fields: MetadataSettingsField[];
  initialField?: MetadataSettingsField;
  initialValues: MetadataFieldFormValues;
  isSubmitting: boolean;
  mode: DialogMode;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: MetadataFieldSubmitPayload) => Promise<void> | void;
  open: boolean;
  resourceType: MetadataResourceType;
};

function DialogIntro({ mode }: { mode: DialogMode }) {
  const { t } = useTranslation();

  return (
    <DialogHeader>
      <DialogTitle>
        {mode === 'edit'
          ? t('Pages.Settings.Metadata.Dialog.editTitle', 'Edit metadata field')
          : mode === 'duplicate'
            ? t(
                'Pages.Settings.Metadata.Dialog.duplicateTitle',
                'Duplicate metadata field',
              )
            : t(
                'Pages.Settings.Metadata.Dialog.createTitle',
                'Create metadata field',
              )}
      </DialogTitle>
      <DialogDescription>
        {mode === 'duplicate'
          ? t(
              'Pages.Settings.Metadata.Dialog.duplicateDescription',
              'A copy of the source field with a fresh key. Adjust the schema before saving if needed.',
            )
          : t(
              'Pages.Settings.Metadata.Dialog.description',
              'Define the typed metadata field exposed on this resource.',
            )}
      </DialogDescription>
    </DialogHeader>
  );
}

export function MetadataFieldFormDialog({
  fields,
  initialField,
  initialValues,
  isSubmitting,
  mode,
  onOpenChange,
  onSubmit,
  open,
  resourceType,
}: MetadataFieldFormDialogProps) {
  const { t } = useTranslation();
  const [autoFocusEditor, setAutoFocusEditor] = useState(false);
  const controller = useMetadataFieldForm({
    fields,
    initialField,
    initialValues,
    isSubmitting,
    mode,
    onSubmit,
    open,
    resourceType,
  });
  const { form } = controller;

  const handleToggleRaw = () => {
    const active = document.activeElement;
    const focusSurvivesToggle =
      active instanceof HTMLElement &&
      (active.id === 'metadata-field-key' ||
        active.id === 'metadata-field-label');
    const enteringRaw = !controller.showRaw;
    controller.toggleRaw();

    if (focusSurvivesToggle) {
      setAutoFocusEditor(false);
      return;
    }
    if (enteringRaw) {
      setAutoFocusEditor(true);
      return;
    }
    setAutoFocusEditor(false);
    requestAnimationFrame(() => {
      document.getElementById('metadata-field-type')?.focus();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" variant="form">
        <DialogIntro mode={mode} />

        <form
          onSubmit={createFormSubmitHandler(form.handleSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <form.AppForm>
            <form.Subscribe selector={(state) => state.values}>
              {(values) => {
                const validationState = controller.getValidationState(values);
                return (
                  <>
                    <DialogBody className="space-y-6">
                      <IdentityFields
                        controller={controller}
                        validationState={validationState}
                      />

                      {controller.showRaw ? (
                        <RawSchemaField
                          autoFocus={autoFocusEditor}
                          controller={controller}
                        />
                      ) : (
                        <SchemaFields
                          controller={controller}
                          validationState={validationState}
                        />
                      )}

                      <RawModeToggle
                        onToggle={handleToggleRaw}
                        showRaw={controller.showRaw}
                      />
                    </DialogBody>

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                      >
                        {t('Common.cancel', 'Cancel')}
                      </Button>
                      <Button
                        type="submit"
                        disabled={validationState.hasErrors || isSubmitting}
                      >
                        {mode === 'edit'
                          ? t('Common.save', 'Save')
                          : t('Common.create', 'Create')}
                      </Button>
                    </DialogFooter>
                  </>
                );
              }}
            </form.Subscribe>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RawModeToggle({
  onToggle,
  showRaw,
}: {
  onToggle: () => void;
  showRaw: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between text-xs">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onToggle}
      >
        <Code2 className="size-3.5" />
        {showRaw
          ? t(
              'Pages.Settings.Metadata.Dialog.useStructured',
              'Use structured editor',
            )
          : t(
              'Pages.Settings.Metadata.Dialog.editRawSchema',
              'Edit raw JSON Schema',
            )}
      </button>
    </div>
  );
}
