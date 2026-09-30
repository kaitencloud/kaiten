import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody } from '@/components/ui/table';
import { ExternalLink, Info, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ATTIO_DEFAULT_MAPPINGS,
  ATTIO_HELP_CREATE_ATTRIBUTE_URL,
  ATTIO_OPTIONAL_SOURCE_FIELDS,
} from '../constants';
import type { EditableMappingRow } from '../types';
import { validateAttioMappings } from '../utils';
import {
  DefaultMappingRow,
  EditableMappingRowView,
  SchemaTableHeader,
} from './attio-wizard-schema-rows';

type AttioWizardStepSchemaProps = {
  editableRows: EditableMappingRow[];
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, patch: Partial<EditableMappingRow>) => void;
  /** Skips the intro block when a host (e.g. the edit dialog) provides its own. */
  hideIntro?: boolean;
};

function renderDefaultRow(field: (typeof ATTIO_DEFAULT_MAPPINGS)[number]) {
  return <DefaultMappingRow key={field.key} field={field} />;
}

export function AttioWizardStepSchema({
  editableRows,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
  hideIntro = false,
}: AttioWizardStepSchemaProps) {
  const { t } = useTranslation();
  const validation = validateAttioMappings(editableRows);
  const usedSourceFields = new Set(
    editableRows.flatMap((r) => (r.sourceField ? [r.sourceField] : [])),
  );
  const allFieldsUsed =
    usedSourceFields.size >= ATTIO_OPTIONAL_SOURCE_FIELDS.length;

  function availableFieldsFor(row: EditableMappingRow) {
    return ATTIO_OPTIONAL_SOURCE_FIELDS.filter(
      (field) =>
        field.key === row.sourceField || !usedSourceFields.has(field.key),
    );
  }

  function renderEditableRow(row: EditableMappingRow) {
    return (
      <EditableMappingRowView
        key={row.id}
        row={row}
        issues={validation.issuesByRowId.get(row.id)}
        availableFields={availableFieldsFor(row)}
        canRemove={editableRows.length > 1}
        onUpdate={(patch) => onUpdateRow(row.id, patch)}
        onRemove={() => onRemoveRow(row.id)}
      />
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {hideIntro ? null : (
        <div>
          <h3 className="text-base font-semibold">
            {t('Pages.Integrations.Connectors.Wizard.Schema.title')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Pages.Integrations.Connectors.Wizard.Schema.description')}
          </p>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">
          {t('Pages.Integrations.Connectors.Wizard.Schema.defaultsTitle')}
        </h4>
        <Card className="overflow-hidden p-0">
          <Table>
            <SchemaTableHeader />
            <TableBody>
              {ATTIO_DEFAULT_MAPPINGS.map(renderDefaultRow)}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">
          {t('Pages.Integrations.Connectors.Wizard.Schema.optionalTitle')}
        </h4>
        <Card className="overflow-hidden p-0">
          <Table>
            <SchemaTableHeader />
            <TableBody>{editableRows.map(renderEditableRow)}</TableBody>
          </Table>
          <div className="border-t px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddRow}
              disabled={allFieldsUsed}
            >
              <Plus />
              {t('Pages.Integrations.Connectors.Wizard.Schema.addRow')}
            </Button>
          </div>
        </Card>
      </section>

      <SchemaFooterNote />
    </div>
  );
}

function SchemaFooterNote() {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
      <Info
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">
          {t('Pages.Integrations.Connectors.Wizard.Schema.FooterNote.title')}
        </span>
        <span className="text-xs text-muted-foreground">
          {t(
            'Pages.Integrations.Connectors.Wizard.Schema.FooterNote.description',
          )}
        </span>
        <a
          href={ATTIO_HELP_CREATE_ATTRIBUTE_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-foreground hover:underline"
        >
          {t('Pages.Integrations.Connectors.Wizard.Schema.FooterNote.helpLink')}
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}
