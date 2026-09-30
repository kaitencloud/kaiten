import { queryOptions } from '@tanstack/react-query';
import type { ConnectorSettings } from '@/api-client';
import { getConnectorSettings } from '@/api-client';
import { getConnectorSettingsQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { ATTIO_CONNECTOR_NAME } from '../constants';
import { getHttpErrorStatus } from './http-error-status';

const attioPath = { connectorName: ATTIO_CONNECTOR_NAME } as const;

export async function getAttioSettings(): Promise<ConnectorSettings | null> {
  try {
    const response = await getConnectorSettings({
      path: attioPath,
      throwOnError: true,
    });

    return response.data ?? null;
  } catch (error) {
    if (getHttpErrorStatus(error) === 404) {
      return null;
    }
    throw error;
  }
}

export const attioSettingsBaseQueryKey = getConnectorSettingsQueryKey({
  path: attioPath,
});

export const attioSettingsQueryOptions = queryOptions({
  queryKey: attioSettingsBaseQueryKey,
  queryFn: getAttioSettings,
});
