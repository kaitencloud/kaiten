import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from './msw-server';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';

afterEach(() => vi.restoreAllMocks());

const get = async (path: string) => (await fetch(`http://api.test/api/${path}`)).json();
const graphql = async (operationName: string, variables = {}) =>
  (await fetch('http://api.test/api/graphql', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName, variables }),
  })).json();

describe('mock protocol and ownership', () => {
  it('never sends an undeclared API request to the network and names the operation', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    server.use(undeclaredApiRequest);
    await expect(graphql('ForgottenOperation')).rejects.toThrow();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('(ForgottenOperation)'));
    await expect(get('forgotten')).rejects.toThrow();
  });

  it('serves every installed owner before sibling fallbacks, including the dev world', async () => {
    const config = createDevMockConfig();
    server.use(...createMockHandlers(config, 'off', undefined, true), undeclaredApiRequest);
    expect((await get('customers')).items).toEqual(config.customers?.customers);
    expect((await get('deployment-zones')).items).toEqual(config.releaseManagement?.deploymentZones);
    expect((await get('releases')).items).toHaveLength(config.releaseManagement?.releases.length ?? 0);
    expect((await graphql('GetInstancesWithRelations')).data.instances.items).toHaveLength(config.instances?.instances.length ?? 0);
    expect((await graphql('GetReleaseManagementOverview')).data.releases.items).toHaveLength(config.releaseManagement?.releases.length ?? 0);
    expect((await graphql('MetadataFields', { resourceType: 'CUSTOMER' })).data.metadataFields.items).toEqual([]);
    expect((await graphql('MetadataFields', { resourceType: 'INSTANCE' })).data.metadataFields.items).toEqual(config.instances?.metadataFields);
  });

  it('persists create, update and delete for a rehydrated customer model', async () => {
    const config: E2EMswConfig = createDevMockConfig();
    const install = () => {
      server.resetHandlers();
      server.use(...createMockHandlers(config, 'off', (slot, state) => { Object.assign(config, { [slot]: state }); }), undeclaredApiRequest);
    };
    const write = (path: string, method: string, body?: unknown) => fetch(`http://api.test/api/${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    install();
    const created = await write('customers', 'POST', { name: 'Contract Customer', slug: 'contract-customer', metadata: {} });
    expect(created.status).toBe(201);
    const customer = await created.json();
    install();
    expect(await get('customers/contract-customer')).toEqual(customer);
    expect((await write('customers/contract-customer', 'PUT', { name: 'Renamed', slug: 'contract-customer', metadata: {} })).status).toBe(200);
    install();
    expect(await get('customers/contract-customer')).toMatchObject({ name: 'Renamed' });
    expect((await write('customers/contract-customer', 'DELETE')).status).toBe(204);
    install();
    expect((await get('customers')).items.some((item: { slug: string }) => item.slug === 'contract-customer')).toBe(false);
    expect((await write('customers/contract-customer', 'GET')).status).toBe(404);
  });
});
