import { Button } from '@/components/ui/button';
import { Loader2, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormDialog } from '@/components/dialog/form-dialog';
import { useAttioSettingsMutations } from '../hooks';
import type { ConnectorSettings, EditableMappingRow } from '../types';
import {
  buildMappingUpdateSettings,
  createEditableRow,
  validateAttioMappings,
} from '../utils';
import { AttioWizardStepSchema } from './attio-wizard-step-schema';

type AttioMappingEditorDialogProps = {
  attioSettings: ConnectorSettings | null;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Rebuilds editable rows from the persisted `fieldsMapping` map. */
function rowsFromSettings(
  attioSettings: ConnectorSettings | null,
): EditableMappingRow[] {
  const fieldsMapping = attioSettings?.settings.fieldsMapping;
  if (!fieldsMapping || typeof fieldsMapping !== 'object') {
    return [createEditableRow()];
  }

  const rows: EditableMappingRow[] = [];
  for (const [sourceField, value] of Object.entries(
    fieldsMapping as Record<string, unknown>,
  )) {
    const attioSlug = asString(value);
    if (attioSlug) {
      rows.push(createEditableRow(sourceField, attioSlug));
    }
  }

  return rows.length > 0 ? rows : [createEditableRow()];
}

/**
 * "Edit field mappings" entry point on the connector detail page. Reuses the
 * wizard schema editor and resubmits the editable settings while preserving
 * the stored API secret by omission.
 */
export function AttioMappingEditorDialog({
  attioSettings,
}: AttioMappingEditorDialogProps) {
  const { t } = useTranslation();
  const { updateMapping } = useAttioSettingsMutations();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EditableMappingRow[]>([]);
  const mappingsValid = validateAttioMappings(rows).isValid;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setRows(rowsFromSettings(attioSettings));
    }
    setOpen(nextOpen);
  }

  async function handleSave() {
    try {
      // `attioApiKey` stays out of the payload: omitted = the API keeps the
      // stored secret (it is only returned redacted anyway).
      await updateMapping.mutateAsync(
        buildMappingUpdateSettings(attioSettings?.settings, rows),
      );
      setOpen(false);
    } catch {
      // Errors surface via the mutation's onError toast.
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={t('Pages.Integrations.Connectors.Detail.EditMapping.title')}
        onClick={() => handleOpenChange(true)}
      >
        <Pencil className="size-3.5" />
      </Button>

      {/* Width matched to the schema editor's own max-w-4xl so the panel
          hugs the mapping tables without dead space. */}
      <FormDialog
        open={open}
        onOpenChange={handleOpenChange}
        className="sm:max-w-4xl"
      >
        <FormDialog.Header>
          <FormDialog.Title>
            {t('Pages.Integrations.Connectors.Detail.EditMapping.title')}
          </FormDialog.Title>
          <FormDialog.Description>
            {t('Pages.Integrations.Connectors.Detail.EditMapping.description')}
          </FormDialog.Description>
        </FormDialog.Header>

        <FormDialog.Content>
          <AttioWizardStepSchema
            hideIntro
            editableRows={rows}
            onAddRow={() => {
              setRows((current) => [...current, createEditableRow()]);
            }}
            onRemoveRow={(id) => {
              setRows((current) => current.filter((row) => row.id !== id));
            }}
            onUpdateRow={(id, patch) => {
              setRows((current) =>
                current.map((row) =>
                  row.id === id ? { ...row, ...patch } : row,
                ),
              );
            }}
          />
        </FormDialog.Content>

        <FormDialog.Footer>
          <Button
            type="button"
            variant="outline"
            disabled={updateMapping.isPending || !mappingsValid}
            onClick={() => handleOpenChange(false)}
          >
            {t('Common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={updateMapping.isPending}
            onClick={handleSave}
          >
            {updateMapping.isPending ? (
              <Loader2 className="animate-spin" />
            ) : null}
            {t('Common.save')}
          </Button>
        </FormDialog.Footer>
      </FormDialog>
    </>
  );
}
