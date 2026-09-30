import {
  type ConnectorSettings,
  deleteConnectorSettings,
  updateConnectorSettings,
} from '@/api-client';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync';
import type { AttioConnectorSettings } from './types';

const attioPath = { connectorName: ATTIO_CONNECTOR_NAME } as const;

export async function upsertAttioSettings(
  settings: AttioConnectorSettings,
): Promise<ConnectorSettings> {
  const response = await updateConnectorSettings({
    path: attioPath,
    body: { settings },
    throwOnError: true,
  });

  return response.data;
}

export async function deleteAttioSettings(): Promise<void> {
  await deleteConnectorSettings({ path: attioPath, throwOnError: true });
}
