import type { AttioSourceField } from './types';

/** Default Attio API URL (matches the worker's `defaultAttioAPIURL`). */
export const ATTIO_API_URL_DEFAULT = 'https://api.attio.com';

/** Sync policies recognized by the worker (`parseSyncPolicy`). */
export const ATTIO_SYNC_POLICIES = [
  'create-and-bind',
  'fail-and-retry',
] as const;
export type AttioSyncPolicy = (typeof ATTIO_SYNC_POLICIES)[number];
export const ATTIO_SYNC_POLICY_DEFAULT: AttioSyncPolicy = 'create-and-bind';

export const ATTIO_HELP_CREATE_ATTRIBUTE_URL =
  'https://attio.com/help/reference/managing-your-data/attributes/create-manage-attributes#create-a-new-attribute';

/**
 * Kaiten event source fields the worker exposes for mapping to Attio attribute
 * slugs. This set is fixed by the connector worker; values are synced as text.
 * Fields with a `defaultSlug` are always synced even if not explicitly mapped.
 */
export const ATTIO_SOURCE_FIELDS: AttioSourceField[] = [
  {
    key: 'customer.id',
    object: 'Company',
    label: 'Customer ID',
    kaitenType: 'Text (unique)',
    kaitenTable: 'customer',
  },
  {
    key: 'customer.name',
    object: 'Company',
    label: 'Customer name',
    kaitenType: 'Text',
    kaitenTable: 'customer',
    defaultSlug: 'name',
  },
  {
    key: 'customer.domain',
    object: 'Company',
    label: 'Customer domain',
    kaitenType: 'Text',
    kaitenTable: 'customer',
    defaultSlug: 'domains',
  },
  {
    key: 'instance.id',
    object: 'Workspace',
    label: 'Instance ID',
    kaitenType: 'Text (unique)',
    kaitenTable: 'instance',
    defaultSlug: 'workspace_id',
  },
  {
    key: 'instance.slug',
    object: 'Workspace',
    label: 'Instance slug',
    kaitenType: 'Text',
    kaitenTable: 'instance',
  },
  {
    key: 'instance.name',
    object: 'Workspace',
    label: 'Instance name',
    kaitenType: 'Text',
    kaitenTable: 'instance',
    defaultSlug: 'name',
  },
  {
    key: 'instance.customerExternalId',
    object: 'Workspace',
    label: 'Company record (Attio)',
    kaitenType: 'Text',
    kaitenTable: 'customer',
    defaultSlug: 'company',
  },
  {
    key: 'instance.licenseType',
    object: 'Workspace',
    label: 'License type',
    kaitenType: 'Select',
    kaitenTable: 'license',
  },
  {
    key: 'instance.licenseName',
    object: 'Workspace',
    label: 'License name',
    kaitenType: 'Text',
    kaitenTable: 'license',
  },
  {
    key: 'instance.licenseStartsAt',
    object: 'Workspace',
    label: 'License starts at',
    kaitenType: 'Date',
    kaitenTable: 'instance',
  },
  {
    key: 'instance.licenseEndsAt',
    object: 'Workspace',
    label: 'License ends at',
    kaitenType: 'Date',
    kaitenTable: 'instance',
  },
  {
    key: 'instance.deploymentZone',
    object: 'Workspace',
    label: 'Deployment zone',
    kaitenType: 'Select',
    kaitenTable: 'deployment_zone',
  },
  {
    key: 'instance.lifecycleStage',
    object: 'Workspace',
    label: 'Lifecycle stage',
    kaitenType: 'Status',
    kaitenTable: 'instance',
  },
];

/** Mappings the worker always applies, shown as locked rows in the schema step. */
export const ATTIO_DEFAULT_MAPPINGS = ATTIO_SOURCE_FIELDS.filter(
  (field): field is AttioSourceField & { defaultSlug: string } =>
    Boolean(field.defaultSlug),
);

/** Fields that users may map in addition to the worker defaults. */
export const ATTIO_OPTIONAL_SOURCE_FIELDS = ATTIO_SOURCE_FIELDS.filter(
  (field) => !field.defaultSlug,
);
