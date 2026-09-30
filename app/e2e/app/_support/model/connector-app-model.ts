import type {
  ConnectorSettings,
  ConnectorSettingsWritable,
} from '@/api-client';
import type { GetAttioSyncedRecordsQuery } from '@/api-client/graphql/graphql';
import {
  zConnectorSettings,
  zConnectorSettingsWritable,
} from '@/api-client/zod.gen';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync/constants';
import { parseContract } from '../contracts/openapi-contract';

const clone = <T>(value: T): T => structuredClone(value);

export type ConnectorAppModelSeed = {
  settings?: ConnectorSettings | null;
  syncedRecords?: GetAttioSyncedRecordsQuery;
};

export type SerializedConnectorAppModel = {
  settings: ConnectorSettings | null;
  syncedRecords: GetAttioSyncedRecordsQuery;
};

const notFound = () =>
  Object.assign(new Error('Attio connector settings not found'), {
    httpStatus: 404,
  });

export class ConnectorAppModel {
  private settings: ConnectorSettings | null;
  private readonly syncedRecords: GetAttioSyncedRecordsQuery;

  constructor(seed: ConnectorAppModelSeed = {}) {
    this.settings = seed.settings
      ? parseContract(
          zConnectorSettings,
          seed.settings,
          'ConnectorAppModel seed.settings',
        )
      : null;
    this.syncedRecords = clone(
      seed.syncedRecords ?? {
        customers: { items: [] },
        instances: { items: [] },
      },
    );
  }

  static fromSerialized(state: SerializedConnectorAppModel) {
    return new ConnectorAppModel(state);
  }

  serializeForMsw(): SerializedConnectorAppModel {
    return {
      settings: clone(this.settings),
      syncedRecords: clone(this.syncedRecords),
    };
  }

  getSettings(): ConnectorSettings {
    if (!this.settings) {
      throw notFound();
    }
    return clone(this.settings);
  }

  updateSettings(body: ConnectorSettingsWritable): ConnectorSettings {
    const input = parseContract(
      zConnectorSettingsWritable,
      body,
      'ConnectorAppModel.updateSettings body',
    );
    const settings = {
      ...input.settings,
      ...(Object.hasOwn(input.settings, 'attioApiKey')
        ? { attioApiKey: '***' }
        : {}),
    };
    this.settings = parseContract(
      zConnectorSettings,
      {
        connector_name: ATTIO_CONNECTOR_NAME,
        settings,
      },
      'ConnectorAppModel.updateSettings result',
    );
    return clone(this.settings);
  }

  deleteSettings() {
    if (!this.settings) {
      throw notFound();
    }
    this.settings = null;
  }

  getSyncedRecords(): GetAttioSyncedRecordsQuery {
    return clone(this.syncedRecords);
  }
}
