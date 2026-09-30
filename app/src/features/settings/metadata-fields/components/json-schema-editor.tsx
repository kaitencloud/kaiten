import { useCallback } from 'react';
import { CodeEditor } from '@/functionals/code-editor';

/**
 * A *permissive* meta-schema describing the JSON Schema documents an admin can
 * author for a metadata field. It is intentionally not strict: the server
 * accepts full JSON Schema 2020-12, so we don't forbid advanced keywords — we
 * only describe the common ones to drive autocomplete and flag the frequent
 * mistake of an unknown primary `type`.
 */
const METADATA_FIELD_META_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['string', 'number', 'integer', 'boolean', 'array'],
      description: 'Primary JSON Schema type for this metadata field.',
    },
    title: { type: 'string', description: 'Human title (cosmetic).' },
    description: {
      type: 'string',
      description: 'Admin-facing help text (cosmetic).',
    },
    format: {
      type: 'string',
      enum: ['date', 'date-time', 'time', 'email', 'uri'],
      description: 'String format hint — e.g. "date" for a DATE field.',
    },
    enum: {
      type: 'array',
      description: 'Allowed values — renders as an ENUM field.',
      items: { type: 'string' },
    },
    examples: { type: 'array', description: 'Example values (cosmetic).' },
    default: { description: 'Default value (cosmetic).' },
    uniqueItems: {
      type: 'boolean',
      description: 'Forbid duplicate items in an array field.',
    },
    items: {
      type: 'object',
      description: 'Item schema for an array (ENUM_LIST) field.',
      properties: {
        type: {
          type: 'string',
          enum: ['string', 'number', 'integer', 'boolean'],
        },
        enum: { type: 'array', items: { type: 'string' } },
        format: { type: 'string' },
      },
    },
  },
};

const META_SCHEMA_URI = 'kaiten://schemas/metadata-field.schema.json';

// Minimal local typings for the Monaco JSON language defaults. We deliberately
// avoid importing monaco's own types: the `languages.json` namespace is
// deprecated in monaco 0.55 (moved to a top-level `json` namespace), so its
// published types no longer expose `jsonDefaults`. We read whichever path the
// runtime provides and degrade gracefully (highlighting still works) if none.
type JsonDiagnosticsOptions = {
  enableSchemaRequest?: boolean;
  schemas?: { fileMatch?: string[]; schema?: unknown; uri: string }[];
  validate?: boolean;
};
type JsonDefaults = {
  setDiagnosticsOptions: (options: JsonDiagnosticsOptions) => void;
};
type MonacoJsonApi = {
  json?: { jsonDefaults?: JsonDefaults };
  languages?: { json?: { jsonDefaults?: JsonDefaults } };
};
type EditorLike = {
  focus: () => void;
  getModel: () => { uri: { toString: () => string } } | null;
};

type JsonSchemaEditorProps = {
  ariaLabel?: string;
  // Focus the editor as soon as it mounts. Used when the form swaps to raw mode
  // so focus lands in the editor instead of escaping to the dialog container.
  autoFocus?: boolean;
  height?: string | number;
  onChange: (value: string) => void;
  value: string;
};

/**
 * Monaco JSON editor preconfigured with a meta-schema so authoring a metadata
 * field's JSON Schema gets syntax highlighting, keyword autocomplete and inline
 * validation (the metadata-field raw-schema escape hatch).
 *
 * Schema-aware features run in the JSON worker — see `@/lib/monaco-workers`.
 */
export function JsonSchemaEditor({
  ariaLabel,
  autoFocus = false,
  height = '240px',
  onChange,
  value,
}: JsonSchemaEditorProps) {
  const handleMount = useCallback(
    (editorInstance: unknown, monaco: unknown) => {
      const editor = editorInstance as EditorLike;
      if (autoFocus && typeof editor.focus === 'function') {
        editor.focus();
      }

      const api = monaco as MonacoJsonApi;
      const jsonDefaults =
        api.json?.jsonDefaults ?? api.languages?.json?.jsonDefaults;
      if (!jsonDefaults) return;

      const model = editor.getModel();

      // Scope the meta-schema to *this* editor's model via `fileMatch` so the
      // global JSON language service doesn't apply it to unrelated editors.
      jsonDefaults.setDiagnosticsOptions({
        validate: true,
        // Never hit the network for `$schema` URLs — only the schema provided
        // here, matched to this model, drives validation/IntelliSense.
        enableSchemaRequest: false,
        schemas: [
          {
            uri: META_SCHEMA_URI,
            fileMatch: model ? [model.uri.toString()] : ['*'],
            schema: METADATA_FIELD_META_SCHEMA,
          },
        ],
      });
    },
    [autoFocus],
  );

  return (
    <CodeEditor
      language="json"
      value={value}
      onChange={(next) => onChange(next ?? '')}
      onMount={handleMount}
      height={height}
      className="text-xs"
      options={{
        ariaLabel,
        lineNumbers: 'on',
        tabSize: 2,
        wordWrap: 'on',
        scrollbar: { alwaysConsumeMouseWheel: false },
      }}
    />
  );
}
