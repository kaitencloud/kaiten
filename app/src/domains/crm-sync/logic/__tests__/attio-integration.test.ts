import { describe, expect, it } from 'vite-plus/test';
import { ATTIO_CONNECTOR_NAME } from '../../constants';
import { getAttioSyncInfo } from '../attio-integration';

const attio = (fields: Record<string, unknown>) => ({
  [ATTIO_CONNECTOR_NAME]: fields,
});

describe('getAttioSyncInfo', () => {
  it('normalizes a complete integration entry', () => {
    expect(
      getAttioSyncInfo(
        attio({
          external_id: 'rec_company_1',
          synced_at: '2026-06-05T10:00:00Z',
          last_error: 'rate limited',
          web_url: 'https://app.attio.com/w/acme',
        }),
      ),
    ).toEqual({
      externalId: 'rec_company_1',
      syncedAt: '2026-06-05T10:00:00Z',
      lastError: 'rate limited',
      webUrl: 'https://app.attio.com/w/acme',
    });
  });

  it('defaults optional fields to null', () => {
    expect(getAttioSyncInfo(attio({ external_id: 'rec_1' }))).toEqual({
      externalId: 'rec_1',
      syncedAt: null,
      lastError: null,
      webUrl: null,
    });
  });

  it('returns null without an integrations map or Attio entry', () => {
    expect(getAttioSyncInfo(null)).toBeNull();
    expect(getAttioSyncInfo(undefined)).toBeNull();
    expect(getAttioSyncInfo({})).toBeNull();
    expect(
      getAttioSyncInfo({
        'kaiten.integration.crm.other': { external_id: 'x' },
      }),
    ).toBeNull();
  });

  it('returns null when the external id is missing or blank', () => {
    expect(getAttioSyncInfo(attio({}))).toBeNull();
    expect(getAttioSyncInfo(attio({ external_id: '   ' }))).toBeNull();
    expect(getAttioSyncInfo(attio({ external_id: 42 }))).toBeNull();
  });

  it('rejects malformed or non-http(s) web urls', () => {
    expect(
      getAttioSyncInfo(attio({ external_id: 'rec_1', web_url: 7 }))?.webUrl,
    ).toBeNull();
    expect(
      getAttioSyncInfo(attio({ external_id: 'rec_1', web_url: '   ' }))
        ?.webUrl,
    ).toBeNull();
    expect(
      getAttioSyncInfo(
        attio({ external_id: 'rec_1', web_url: 'javascript:alert(1)' }),
      )?.webUrl,
    ).toBeNull();
  });

  it('ignores a legacy metadata.web_url left by older workers', () => {
    expect(
      getAttioSyncInfo(
        attio({
          external_id: 'rec_1',
          metadata: { web_url: 'https://app.attio.com/w/acme' },
        }),
      )?.webUrl,
    ).toBeNull();
  });
});
