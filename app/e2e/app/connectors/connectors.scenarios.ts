import { ConnectorAppModel } from '../_support/model/connector-app-model';

export function createDisconnectedAttioModel() {
  return new ConnectorAppModel({
    syncedRecords: {
      customers: {
        items: [
          {
            id: 'customer-1',
            integrations: {
              'kaiten.integration.crm.attio': {
                external_id: 'attio-company-1',
                last_error: null,
                synced_at: '2026-06-11T12:00:00Z',
              },
            },
            name: 'Acme Corp',
            slug: 'acme-corp',
          },
        ],
      },
      instances: {
        items: [
          {
            id: 'instance-1',
            integrations: {
              'kaiten.integration.crm.attio': {
                external_id: 'attio-workspace-1',
                last_error: null,
                synced_at: '2026-06-11T12:05:00Z',
              },
            },
            name: 'Acme Production',
            slug: 'acme-production',
          },
        ],
      },
    },
  });
}
