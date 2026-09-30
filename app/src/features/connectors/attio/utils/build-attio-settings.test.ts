import { describe, expect, it } from 'vite-plus/test';
import { ATTIO_API_URL_DEFAULT, ATTIO_SYNC_POLICY_DEFAULT } from '../constants';
import type { EditableMappingRow } from '../types';
import {
  buildAttioSettings,
  buildFieldsMapping,
  buildMappingUpdateSettings,
} from './build-attio-settings';

function row(
  id: string,
  sourceField: string | null,
  attioSlug: string | null,
): EditableMappingRow {
  return { id, sourceField, attioSlug };
}

describe('Attio buildFieldsMapping', () => {
  it('keys mappings by the source field', () => {
    const mapping = buildFieldsMapping([
      row('r1', 'customer.id', 'kaiten_customer_id'),
    ]);

    expect(mapping).toEqual({ 'customer.id': 'kaiten_customer_id' });
  });

  it('skips incomplete rows and trims values', () => {
    const mapping = buildFieldsMapping([
      row('r1', '  instance.slug  ', '  kaiten_instance_slug  '),
      row('r2', 'customer.name', null),
      row('r3', null, 'name'),
    ]);

    expect(mapping).toEqual({ 'instance.slug': 'kaiten_instance_slug' });
  });
});

describe('buildAttioSettings', () => {
  it('trims the token, forwards the sync policy and the default URL', () => {
    const settings = buildAttioSettings(
      '  atk_live_token  ',
      'fail-and-retry',
      [row('r1', 'instance.licenseType', 'kaiten_license_type')],
    );

    expect(settings).toEqual({
      attioApiKey: 'atk_live_token',
      attioApiUrl: ATTIO_API_URL_DEFAULT,
      syncPolicy: 'fail-and-retry',
      fieldsMapping: { 'instance.licenseType': 'kaiten_license_type' },
    });
  });
});

describe('buildMappingUpdateSettings', () => {
  it('never includes attioApiKey, even when the read echoes one', () => {
    const settings = buildMappingUpdateSettings(
      {
        attioApiKey: '***',
        attioApiUrl: 'https://api.attio.example',
        syncPolicy: 'fail-and-retry',
      },
      [row('r1', 'instance.licenseType', 'kaiten_license_type')],
    );

    expect(settings).not.toHaveProperty('attioApiKey');
    expect(settings).toEqual({
      attioApiUrl: 'https://api.attio.example',
      syncPolicy: 'fail-and-retry',
      fieldsMapping: { 'instance.licenseType': 'kaiten_license_type' },
    });
  });

  it('falls back to defaults when stored settings are missing or empty', () => {
    const settings = buildMappingUpdateSettings(undefined, [
      row('r1', 'customer.id', 'kaiten_customer_id'),
    ]);

    expect(settings).toEqual({
      attioApiUrl: ATTIO_API_URL_DEFAULT,
      syncPolicy: ATTIO_SYNC_POLICY_DEFAULT,
      fieldsMapping: { 'customer.id': 'kaiten_customer_id' },
    });
  });
});
