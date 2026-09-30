/** The two Attio object collections the worker syncs into. */
export type AttioObjectName = 'Company' | 'Workspace';

/** Kaiten-side value type of a source field, shown as a badge in the mapper. */
export type AttioSourceFieldType =
  | 'Text'
  | 'Text (unique)'
  | 'Number'
  | 'Date'
  | 'Select'
  | 'Multiselect'
  | 'Status';

/** Kaiten table the source field value comes from. */
export type AttioSourceFieldTable =
  | 'customer'
  | 'instance'
  | 'license'
  | 'deployment_zone';

/**
 * A Kaiten event source field the worker can map to an Attio attribute slug.
 * The set is fixed by the connector worker (CDC event payloads), text-only.
 */
export type AttioSourceField = {
  key: string;
  object: AttioObjectName;
  label: string;
  kaitenType: AttioSourceFieldType;
  kaitenTable: AttioSourceFieldTable;
  /** Attio slug applied by the worker when the field is not explicitly mapped. */
  defaultSlug?: string;
};

export type AttioSetupView = 'index' | 'wizard';
export type SyncedRecordKind = 'customer' | 'instance';

/** A Kaiten entity synced to Attio (from the per-entity integration data). */
export type SyncedRecord = {
  id: string;
  kind: SyncedRecordKind;
  name: string;
  slug: string;
  object: AttioObjectName;
  externalId: string;
  syncedAt: string | null;
  lastError: string | null;
};

/** A user-added field mapping row in the schema step (source field → Attio slug). */
export type EditableMappingRow = {
  id: string;
  sourceField: string | null;
  attioSlug: string | null;
};

/**
 * Payload persisted via PUT /connectors/{name}/settings (Attio settings schema).
 * `attioApiKey` is write-only: reads redact it and omission preserves the secret.
 */
export type AttioConnectorSettings = {
  attioApiKey?: string;
  attioApiUrl: string;
  syncPolicy: string;
  fieldsMapping: Record<string, string>;
};

/** Response shape of GET/PUT /connectors/{name}/settings (generated). */
export type { ConnectorSettings } from '@/api-client';
