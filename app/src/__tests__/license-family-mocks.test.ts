import { describe, expect, it } from 'vite-plus/test';
import type { LicenseFamilyView, PageLicenseFamilyView } from '@/api-client';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import type { LicenseAppModel } from '../../e2e/app/_support/model/license-app-model';
import { createLifecycleLicensesModel } from '../../e2e/app/billing/lifecycle-world';
import { server } from './msw-server';

// What the mocks standing in for the license module answer about the families:
// each is private until it is listed in the public catalogue, as the API says, and
// the listing is written with PATCH /license-families/{familySlug}. These read the
// answers off the wire, as the console does.

const API = 'http://api.test/api';

const install = (model: LicenseAppModel) => {
  const config: E2EMswConfig = { licenses: model.serializeForMsw() };
  server.use(...createMockHandlers(config, 'off', undefined, true), undeclaredApiRequest);
};

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });

const families = async () =>
  (
    (await (await send('GET', '/license-families')).json()) as PageLicenseFamilyView
  ).items;

describe('the families of licenses, as the mocks serve them', () => {
  it('lists each family as private until it is listed in the public catalogue', async () => {
    install(createLifecycleLicensesModel());

    expect((await families()).map(({ isPublic, slug }) => [slug, isPublic])).toEqual([
      ['pro-v2', false],
      ['enterprise-v1', true],
    ]);
  });

  it('lists a family and takes it out, and the list follows', async () => {
    install(createLifecycleLicensesModel());

    const listed = (await (
      await send('PATCH', '/license-families/pro-v2', { isPublic: true })
    ).json()) as LicenseFamilyView;
    const afterListing = await families();
    const unlisted = (await (
      await send('PATCH', '/license-families/enterprise-v1', { isPublic: false })
    ).json()) as LicenseFamilyView;

    expect(listed).toMatchObject({ isPublic: true, slug: 'pro-v2' });
    expect(afterListing.map(({ isPublic }) => isPublic)).toEqual([true, true]);
    expect(unlisted.isPublic).toBe(false);
    expect((await families()).map(({ isPublic }) => isPublic)).toEqual([true, false]);
  });

  it('refuses a family that does not exist, with the code of the API', async () => {
    install(createLifecycleLicensesModel());

    const response = await send('PATCH', '/license-families/nowhere', { isPublic: true });

    expect(response.status).toBe(404);
    expect(((await response.json()) as { code?: string }).code).toBe(
      'UpdateLicenseFamily.NotFound',
    );
  });

  it('refuses as armed, once, with the words of the API', async () => {
    const model = createLifecycleLicensesModel();
    model.setNextProblem('updateLicenseFamily', {
      code: 'UpdateLicenseFamily.NotFound',
      detail: 'license family "pro-v2" not found',
      status: 404,
    });
    install(model);

    const refused = await send('PATCH', '/license-families/pro-v2', { isPublic: true });
    const then = await send('PATCH', '/license-families/pro-v2', { isPublic: true });

    expect(refused.status).toBe(404);
    expect(then.status).toBe(200);
  });
});
