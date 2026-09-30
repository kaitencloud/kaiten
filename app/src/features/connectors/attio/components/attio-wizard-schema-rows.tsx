import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowRight, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ATTIO_SOURCE_FIELDS } from '../constants';
import type {
  AttioObjectName,
  AttioSourceField,
  EditableMappingRow,
} from '../types';
import type { AttioMappingIssue } from '../utils';
import {
  SourceFieldPicker,
  SourceFieldSummary,
} from './attio-wizard-schema-pickers';

const EMPTY_ISSUES: AttioMappingIssue[] = [];

export function SchemaTableHeader() {
  const { t } = useTranslation();
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="pl-4">
          {t('Pages.Integrations.Connectors.Wizard.Schema.Table.sourceField')}
        </TableHead>
        <TableHead className="w-[160px]">
          {t('Pages.Integrations.Connectors.Wizard.Schema.Table.attioObject')}
        </TableHead>
        <TableHead className="pr-4">
          {t('Pages.Integrations.Connectors.Wizard.Schema.Table.attioSlug')}
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

function ObjectPill({ object }: { object: AttioObjectName }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-muted-foreground">
      <ArrowRight className="size-3.5" aria-hidden />
      <Badge variant="secondary" className="font-mono text-xs">
        {object}
      </Badge>
    </div>
  );
}

export function DefaultMappingRow({
  field,
}: {
  field: AttioSourceField & { defaultSlug: string };
}) {
  const { t } = useTranslation();
  return (
    <TableRow className="bg-muted/40">
      <TableCell className="pl-4 align-middle">
        <SourceFieldSummary field={field} muted />
      </TableCell>
      <TableCell className="align-middle">
        <ObjectPill object={field.object} />
      </TableCell>
      <TableCell className="pr-4 align-middle">
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          <span className="font-mono text-xs text-muted-foreground">
            {field.defaultSlug}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {t('Pages.Integrations.Connectors.Wizard.Schema.defaultBadge')}
          </Badge>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function EditableMappingRowView({
  row,
  issues = EMPTY_ISSUES,
  availableFields,
  canRemove,
  onUpdate,
  onRemove,
}: {
  row: EditableMappingRow;
  issues?: AttioMappingIssue[];
  availableFields: AttioSourceField[];
  canRemove: boolean;
  onUpdate: (patch: Partial<EditableMappingRow>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const selected = ATTIO_SOURCE_FIELDS.find((f) => f.key === row.sourceField);
  const issue = issues[0];
  const issueMessageKey = issue
    ? {
        'duplicate-source':
          'Pages.Integrations.Connectors.Wizard.Schema.duplicateSource',
        'duplicate-target':
          'Pages.Integrations.Connectors.Wizard.Schema.duplicateTarget',
        incomplete:
          'Pages.Integrations.Connectors.Wizard.Schema.incompleteMapping',
        'invalid-slug':
          'Pages.Integrations.Connectors.Wizard.Schema.invalidSlug',
      }[issue]
    : null;

  return (
    <TableRow>
      <TableCell className="pl-4 align-middle">
        <SourceFieldPicker
          options={availableFields}
          selected={selected}
          onSelect={(key) => onUpdate({ sourceField: key })}
        />
      </TableCell>
      <TableCell className="align-middle">
        {selected ? (
          <ObjectPill object={selected.object} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="pr-4 align-middle">
        <div className="flex items-center gap-2">
          <Input
            value={row.attioSlug ?? ''}
            onChange={(event) => onUpdate({ attioSlug: event.target.value })}
            placeholder={t(
              'Pages.Integrations.Connectors.Wizard.Schema.attioSlugPlaceholder',
            )}
            aria-invalid={Boolean(issue) || undefined}
            className="font-mono text-xs"
          />
          {canRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-muted-foreground hover:text-destructive-subtle-foreground"
              onClick={onRemove}
              aria-label={t(
                'Pages.Integrations.Connectors.Wizard.Schema.removeMapping',
              )}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          )}
        </div>
        {issueMessageKey ? (
          <p className="mt-1 text-xs text-destructive-subtle-foreground">
            {t(issueMessageKey)}
          </p>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
