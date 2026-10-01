import { Input } from '@/components/ui/input';
import { Info, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import RequiredMark from '@/components/form/required-mark';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { primaryTypeLabel } from '../metadata-field-helpers';
import { metadataPrimaryTypes } from '../schemas/metadata-fields.schema';
import type { MetadataPrimaryType } from '../types';
import type { useMetadataFieldForm } from '../use-metadata-field-form';
import { JsonSchemaEditor } from './json-schema-editor';

export type MetadataFieldFormController = ReturnType<
  typeof useMetadataFieldForm
>;

type ValidationState = ReturnType<
  MetadataFieldFormController['getValidationState']
>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive-subtle-foreground">{message}</p>
  );
}

function FieldWarning({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-warning-subtle-foreground">
      <TriangleAlert className="mt-0.5 size-3 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

const visibleError = (isTouched: boolean, message?: string) =>
  isTouched ? message : undefined;

function renderPrimaryTypeItem(primaryType: MetadataPrimaryType) {
  return (
    <SelectItem key={primaryType} value={primaryType}>
      {primaryTypeLabel(primaryType)}
    </SelectItem>
  );
}

function PrimaryTypeItems() {
  return <>{metadataPrimaryTypes.map(renderPrimaryTypeItem)}</>;
}

export function IdentityFields({
  controller,
  validationState,
}: {
  controller: MetadataFieldFormController;
  validationState: ValidationState;
}) {
  const { t } = useTranslation();
  const { errors, warnings } = validationState;
  const { form, keyDisabled } = controller;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form.AppField name="key">
        {(field) => (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="metadata-field-key">
                {t('Pages.Settings.Metadata.Dialog.keyLabel', 'Key')}
              </Label>
              <RequiredMark />
            </div>
            <Input
              id="metadata-field-key"
              aria-required="true"
              value={field.state.value}
              disabled={keyDisabled}
              placeholder="hostingRegion"
              aria-invalid={Boolean(field.state.meta.isTouched && errors.key)}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
            <FieldError
              message={visibleError(field.state.meta.isTouched, errors.key)}
            />
            <FieldWarning message={warnings.key} />
          </div>
        )}
      </form.AppField>

      <form.AppField name="label">
        {(field) => (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="metadata-field-label">
                {t('Pages.Settings.Metadata.Dialog.labelLabel', 'Label')}
              </Label>
              <RequiredMark />
            </div>
            <Input
              id="metadata-field-label"
              aria-required="true"
              value={field.state.value}
              placeholder="Hosting region"
              aria-invalid={Boolean(field.state.meta.isTouched && errors.label)}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
            <FieldError
              message={visibleError(field.state.meta.isTouched, errors.label)}
            />
          </div>
        )}
      </form.AppField>
    </div>
  );
}

export function SchemaFields({
  controller,
  validationState,
}: {
  controller: MetadataFieldFormController;
  validationState: ValidationState;
}) {
  const { t } = useTranslation();
  const { errors, showEnumOptions } = validationState;
  const { form } = controller;

  return (
    <>
      <form.AppField name="primaryType">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="metadata-field-type">
              {t('Pages.Settings.Metadata.Dialog.typeLabel', 'Primary type')}
            </Label>
            <Select
              items={metadataPrimaryTypes.map((type) => ({
                value: type,
                label: primaryTypeLabel(type),
              }))}
              value={field.state.value}
              onValueChange={(value) =>
                field.handleChange(value as MetadataPrimaryType)
              }
            >
              <SelectTrigger id="metadata-field-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <PrimaryTypeItems />
              </SelectContent>
            </Select>
          </div>
        )}
      </form.AppField>

      {showEnumOptions ? (
        <form.AppField name="enumOptionsText">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="metadata-field-options">
                {t('Pages.Settings.Metadata.Dialog.optionsLabel', 'Options')}
              </Label>
              <Textarea
                id="metadata-field-options"
                value={field.state.value}
                placeholder={'production\nstaging\nsandbox'}
                aria-invalid={Boolean(
                  field.state.meta.isTouched && errors.enumOptionsText,
                )}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'Pages.Settings.Metadata.Dialog.optionsHint',
                  'One option per line. Commas are kept as part of the value.',
                )}
              </p>
              <FieldError
                message={visibleError(
                  field.state.meta.isTouched,
                  errors.enumOptionsText,
                )}
              />
            </div>
          )}
        </form.AppField>
      ) : null}

      <form.AppField name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="metadata-field-description">
              {t(
                'Pages.Settings.Metadata.Dialog.descriptionLabel',
                'Description',
              )}
            </Label>
            <Textarea
              id="metadata-field-description"
              value={field.state.value}
              placeholder={t(
                'Pages.Settings.Metadata.Dialog.descriptionPlaceholder',
                'Optional context for admins using this field.',
              )}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'Pages.Settings.Metadata.Dialog.descriptionHint',
                'Plain text — Markdown is not rendered.',
              )}
            </p>
          </div>
        )}
      </form.AppField>
    </>
  );
}

export function RawSchemaField({
  autoFocus,
  controller,
}: {
  autoFocus: boolean;
  controller: MetadataFieldFormController;
}) {
  const { t } = useTranslation();
  const { rawError, rawSchemaText, updateRawSchemaText } = controller;
  const editorLabel = t(
    'Pages.Settings.Metadata.Dialog.rawSchemaLabel',
    'Raw JSON Schema',
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label>{editorLabel}</Label>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="inline-flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={t(
                  'Pages.Settings.Metadata.Dialog.rawSchemaDraftTooltip',
                  'Authored as JSON Schema draft 2020-12 — the dialect that determines which keywords (type, enum, items, format, …) are valid.',
                )}
              >
                <Info className="size-3.5" />
              </button>
            }
          />
          <TooltipContent className="max-w-xs">
            {t(
              'Pages.Settings.Metadata.Dialog.rawSchemaDraftTooltip',
              'Authored as JSON Schema draft 2020-12 — the dialect that determines which keywords (type, enum, items, format, …) are valid.',
            )}
          </TooltipContent>
        </Tooltip>
      </div>
      <JsonSchemaEditor
        ariaLabel={editorLabel}
        autoFocus={autoFocus}
        value={rawSchemaText}
        onChange={updateRawSchemaText}
      />
      <p className="text-xs text-muted-foreground">
        {t(
          'Pages.Settings.Metadata.Dialog.rawSchemaHint',
          'Escape hatch — Monaco highlights JSON syntax; the server still applies transition rules and rejects unsafe changes.',
        )}
      </p>
      {rawError ? (
        <p className="text-xs text-destructive-subtle-foreground">{rawError}</p>
      ) : null}
    </div>
  );
}
