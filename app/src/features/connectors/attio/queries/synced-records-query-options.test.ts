import { describe, expect, it } from 'vite-plus/test';
import type { GetAttioSyncedRecordsQuery } from '@/api-client/graphql/graphql';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync';
import { mapSyncedRecords } from './synced-records-query-options';

const attio = (fields: Record<string, unknown>) => ({
  [ATTIO_CONNECTOR_NAME]: fields,
});

describe('Attio mapSyncedRecords', () => {
  it('maps customers→Company and instances→Workspace with sync state', () => {
    const data: GetAttioSyncedRecordsQuery = {
      customers: {
        items: [
          {
            id: 'c1',
            slug: 'acme',
            name: 'Acme',
            integrations: attio({
              external_id: 'rec_company_1',
              synced_at: '2026-06-05T10:00:00Z',
              last_error: null,
            }),
          },
        ],
      },
      instances: {
        items: [
          {
            id: 'i1',
            slug: 'acme-prod',
            name: 'Acme Prod',
            integrations: attio({
              external_id: 'rec_ws_1',
              synced_at: null,
              last_error: 'rate limited',
            }),
          },
        ],
      },
    };

    expect(mapSyncedRecords(data)).toEqual([
      {
        id: 'c1',
        kind: 'customer',
        name: 'Acme',
        slug: 'acme',
        object: 'Company',
        externalId: 'rec_company_1',
        syncedAt: '2026-06-05T10:00:00Z',
        lastError: null,
      },
      {
        id: 'i1',
        kind: 'instance',
        name: 'Acme Prod',
        slug: 'acme-prod',
        object: 'Workspace',
        externalId: 'rec_ws_1',
        syncedAt: null,
        lastError: 'rate limited',
      },
    ]);
  });

  it('skips entities without an Attio external id', () => {
    const data: GetAttioSyncedRecordsQuery = {
      customers: {
        items: [
          { id: 'c1', slug: 'no-attio', name: 'No Attio', integrations: {} },
          {
            id: 'c2',
            slug: 'other-adapter',
            name: 'Other',
            integrations: {
              'kaiten.integration.crm.other': { external_id: 'x' },
            },
          },
        ],
      },
      instances: { items: [] },
    };

    expect(mapSyncedRecords(data)).toEqual([]);
  });
});
