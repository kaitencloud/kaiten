import { queryOptions } from '@tanstack/react-query';
import type {
  GetAttioSyncedRecordsQuery,
  GetAttioSyncedRecordsQueryVariables,
} from '@/api-client/graphql/graphql';
import { ATTIO_CONNECTOR_NAME, getAttioSyncInfo } from '@/domains/crm-sync';
import { graphqlClient } from '@/lib/graphql-client';
import type { AttioObjectName, SyncedRecord, SyncedRecordKind } from '../types';
import { GET_ATTIO_SYNCED_RECORDS } from './synced-records.queries';

export const attioSyncedRecordsBaseQueryKey = [
  'connectors',
  'attio',
  'synced-records',
] as const;

type SyncedEntity = GetAttioSyncedRecordsQuery['customers']['items'][number];

function toSyncedRecord(
  entity: SyncedEntity,
  kind: SyncedRecordKind,
  object: AttioObjectName,
): SyncedRecord | null {
  const syncInfo = getAttioSyncInfo(entity.integrations);
  if (!syncInfo) {
    return null;
  }
  return {
    id: entity.id,
    kind,
    name: entity.name,
    slug: entity.slug,
    object,
    externalId: syncInfo.externalId,
    syncedAt: syncInfo.syncedAt,
    lastError: syncInfo.lastError,
  };
}

function isSyncedRecord(record: SyncedRecord | null): record is SyncedRecord {
  return record !== null;
}

/** Normalizes the GraphQL response into the Attio-synced records (pure). */
export function mapSyncedRecords(
  data: GetAttioSyncedRecordsQuery,
): SyncedRecord[] {
  const customers = data.customers.items.flatMap((entity) => {
    const record = toSyncedRecord(entity, 'customer', 'Company');
    return isSyncedRecord(record) ? [record] : [];
  });
  const instances = data.instances.items.flatMap((entity) => {
    const record = toSyncedRecord(entity, 'instance', 'Workspace');
    return isSyncedRecord(record) ? [record] : [];
  });

  return [...customers, ...instances];
}

async function fetchAttioSyncedRecords({
  signal,
}: {
  signal: AbortSignal;
}): Promise<SyncedRecord[]> {
  const variables = {
    connectorName: ATTIO_CONNECTOR_NAME,
  } satisfies GetAttioSyncedRecordsQueryVariables;
  const data = await graphqlClient.request<GetAttioSyncedRecordsQuery>(
    GET_ATTIO_SYNCED_RECORDS.toString(),
    variables,
    signal,
  );
  return mapSyncedRecords(data);
}

export const attioSyncedRecordsQueryOptions = queryOptions({
  queryKey: attioSyncedRecordsBaseQueryKey,
  queryFn: fetchAttioSyncedRecords,
});
