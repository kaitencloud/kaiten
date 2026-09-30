import { ATTIO_CONNECTOR_NAME } from '../constants';

/**
 * Loose shape of one `integrations` entry. Covers both the GraphQL `Map`
 * scalar (`Record<string, unknown>`) and the REST `CustomerIntegration` /
 * `InstanceIntegration` payloads.
 */
export type AttioIntegrationEntry = {
  external_id?: unknown;
  synced_at?: unknown;
  last_error?: unknown;
  web_url?: unknown;
  metadata?: unknown;
};

/** Normalized Attio sync data for one Kaiten entity. */
export type AttioSyncInfo = {
  externalId: string;
  syncedAt: string | null;
  lastError: string | null;
  /** Web link to the Attio record, when the integration carries `web_url`. */
  webUrl: string | null;
};

export function readAttioIntegration(
  integrations: Record<string, unknown> | null | undefined,
): AttioIntegrationEntry | null {
  const entry = integrations?.[ATTIO_CONNECTOR_NAME];
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  return entry as AttioIntegrationEntry;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * The API validates `web_url` as an absolute http(s) URL; re-check here so a
 * hand-crafted value can never end up in an `href` with another scheme.
 */
function readWebUrl(webUrl: unknown): string | null {
  const value = asString(webUrl);
  if (!value || !/^https?:\/\//.test(value)) {
    return null;
  }
  return value;
}

/**
 * Reads the Attio entry of an entity `integrations` map (pure). Returns null
 * when the entity is not linked to Attio (no entry or empty external id).
 */
export function getAttioSyncInfo(
  integrations: Record<string, unknown> | null | undefined,
): AttioSyncInfo | null {
  const integration = readAttioIntegration(integrations);
  const externalId = asString(integration?.external_id);
  if (!externalId) {
    return null;
  }
  return {
    externalId,
    syncedAt: asString(integration?.synced_at),
    lastError: asString(integration?.last_error),
    webUrl: readWebUrl(integration?.web_url),
  };
}
