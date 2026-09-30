import { ATTIO_API_URL_DEFAULT, ATTIO_SYNC_POLICY_DEFAULT } from '../constants';
import type { AttioConnectorSettings, EditableMappingRow } from '../types';

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Serializes the wizard's editable rows into the connector `fieldsMapping`
 * (`{ [sourceField]: attioSlug }`). Incomplete rows are skipped. Worker defaults
 * (e.g. `customer.name → name`) stay implicit and are not emitted here.
 */
export function buildFieldsMapping(
  rows: EditableMappingRow[],
): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const row of rows) {
    const sourceField = row.sourceField?.trim();
    const attioSlug = row.attioSlug?.trim();
    if (!sourceField || !attioSlug) {
      continue;
    }
    mapping[sourceField] = attioSlug;
  }

  return mapping;
}

export function buildAttioSettings(
  apiToken: string,
  syncPolicy: string,
  rows: EditableMappingRow[],
): AttioConnectorSettings {
  return {
    attioApiKey: apiToken.trim(),
    attioApiUrl: ATTIO_API_URL_DEFAULT,
    syncPolicy,
    fieldsMapping: buildFieldsMapping(rows),
  };
}

/**
 * Builds the Attio PUT payload for a mapping-only update from stored settings.
 * `attioApiKey` is intentionally absent: the API keeps the stored secret when
 * the field is omitted, so it must never be echoed back from a read.
 */
export function buildMappingUpdateSettings(
  storedSettings: Record<string, unknown> | undefined,
  rows: EditableMappingRow[],
): AttioConnectorSettings {
  return {
    attioApiUrl:
      asNonEmptyString(storedSettings?.attioApiUrl) ?? ATTIO_API_URL_DEFAULT,
    syncPolicy:
      asNonEmptyString(storedSettings?.syncPolicy) ?? ATTIO_SYNC_POLICY_DEFAULT,
    fieldsMapping: buildFieldsMapping(rows),
  };
}
