import { beforeEach, describe, expect, it } from 'vite-plus/test';
import type {
  Addon,
  AddonEntitlement,
  AddonFamily,
  EntitlementUsage,
  Invoice,
  InstanceAddon,
  Price,
  StartedSubscription,
} from '@/api-client';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { server } from './msw-server';

// What the mocks standing in for the add-ons answer: the same refusals, with the same
// codes, in the order the API checks them (api/internal/modules/addons/*), because the
// console is tested against them. They are read off the wire, as the console does,
// over the world of `pnpm run dev:mock`: the catalogue and what the instances hold of
// it, with the effective limits the instances read.

const API = 'http://api.test/api';

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });

const json = async <T>(response: Response) => (await response.json()) as T;
/** The rows of a list the API pages: the first page holds them all in these seeds. */
const items = async <T>(response: Response) =>
  (await json<{ hasMore: boolean; items: T[] }>(response)).items;
const refusal = async (response: Response) =>
  json<{
    code?: string;
    detail?: string;
    errors?: Array<{ location?: string; message?: string; value?: { code?: string } }>;
  }>(response);

const limitOf = async (instanceSlug: string, entitlementSlug: string) => {
  const usages = await json<EntitlementUsage[]>(
    await send('GET', `/instances/${instanceSlug}/entitlements/usage`),
  );

  return usages.find((usage) => usage.entitlementSlug === entitlementSlug)?.limit;
};

beforeEach(() => {
  server.use(
    ...createMockHandlers(createDevMockConfig(), 'off', undefined, true),
    undeclaredApiRequest,
  );
});

describe('the add-on catalogue, as the mocks serve it', () => {
  it('lists every family with its versions newest first, its current one and whether it is public', async () => {
    const families = await json<AddonFamily[]>(await send('GET', '/addon-families'));
    const seats = families.find(({ slug }) => slug === 'extra-seats');

    expect(families.map(({ slug }) => slug).sort()).toEqual([
      'analytics-preview',
      'extra-seats',
      'extra-storage',
      'priority-support-pack',
    ]);
    expect(seats).toMatchObject({
      currentVersion: { isDefault: true, slug: 'extra-seats' },
      isPublic: true,
      lastVersion: 2,
    });
    expect(seats?.versions?.map(({ slug }) => slug)).toEqual([
      'extra-seats-v2',
      'extra-seats',
    ]);
    // One that was never listed is private.
    expect(
      families.find(({ slug }) => slug === 'extra-storage')?.isPublic,
    ).toBe(false);
  });

  it('lists a family in the public catalogue, and takes it out again', async () => {
    const listed = await json<AddonFamily>(
      await send('PATCH', '/addon-families/extra-storage', { isPublic: true }),
    );
    const unlisted = await json<AddonFamily>(
      await send('PATCH', '/addon-families/extra-storage', { isPublic: false }),
    );
    const missing = await send('PATCH', '/addon-families/ghost', { isPublic: true });

    expect(listed.isPublic).toBe(true);
    expect(unlisted.isPublic).toBe(false);
    expect(missing.status).toBe(404);
    expect((await refusal(missing)).code).toBe('UpdateAddonFamily.NotFound');
  });

  it('serves a version by the state asked for', async () => {
    const published = await items<Addon>(
      await send('GET', '/addons?lifecycleState=PUBLISHED'),
    );
    const family = await items<Addon>(await send('GET', '/addons?familySlug=extra-storage'));

    expect(published.every(({ lifecycleState }) => lifecycleState === 'PUBLISHED')).toBe(
      true,
    );
    expect(published.map(({ slug }) => slug)).not.toContain('extra-seats-v2');
    expect(family.map(({ slug }) => slug).sort()).toEqual([
      'extra-storage',
      'extra-storage-v2',
    ]);
  });

  it('numbers the next version of a family, and opens a family on its first', async () => {
    const next = await json<Addon>(
      await send('POST', '/addons', {
        description: 'Ten seats a unit',
        familySlug: 'extra-seats',
        name: 'Extra seats',
        pricingType: 'PAID',
      }),
    );
    const first = await send('POST', '/addons', {
      description: 'More history',
      name: 'Extra history',
      pricingType: 'PAID',
    });
    const opened = await json<Addon>(first);

    expect(next).toMatchObject({
      familySlug: 'extra-seats',
      lifecycleState: 'PUBLISHED',
      slug: 'extra-seats-v3',
      version: 3,
    });
    expect(first.status).toBe(201);
    expect(opened).toMatchObject({ familySlug: 'extra-history', slug: 'extra-history', version: 1 });
    expect(
      (await send('POST', '/addons', { description: '', familySlug: 'ghost', name: 'X', pricingType: 'PAID' })).status,
    ).toBe(404);
  });

  it('moves a version along its lifecycle, and refuses the moves the API refuses', async () => {
    const published = await json<Addon>(await send('POST', '/addons/extra-seats-v2/publish'));
    const again = await send('POST', '/addons/extra-seats-v2/publish');
    const archivedDefault = await send('POST', '/addons/extra-seats/archive');
    const archived = await json<Addon>(await send('POST', '/addons/extra-seats-v2/archive'));
    const back = await json<Addon>(await send('POST', '/addons/extra-seats-v2/unarchive'));

    expect(published.lifecycleState).toBe('PUBLISHED');
    expect(again.status).toBe(409);
    expect((await refusal(again)).code).toBe('PublishAddon.NotADraft');
    expect(archivedDefault.status).toBe(409);
    expect((await refusal(archivedDefault)).code).toBe('ArchiveAddon.DefaultMustBePublished');
    expect(archived.lifecycleState).toBe('ARCHIVED');
    expect(back.lifecycleState).toBe('PUBLISHED');
  });

  it('refuses to delete what an instance ever held, or still grants, and deletes the rest', async () => {
    const held = await send('DELETE', '/addons/extra-seats');
    const granting = await send('DELETE', '/addons/extra-seats-v2');

    expect(held.status).toBe(409);
    expect((await refusal(held)).code).toBe('DeleteAddon.InUseConflict');
    expect(granting.status).toBe(409);
    expect((await refusal(granting)).code).toBe('DeleteAddon.InUseConflict');

    for (const grant of await json<AddonEntitlement[]>(
      await send('GET', '/addons/extra-seats-v2/entitlements'),
    )) {
      expect(
        (await send('DELETE', `/addons/extra-seats-v2/entitlements/${grant.entitlementSlug}`)).status,
      ).toBe(204);
    }
    expect((await send('DELETE', '/addons/extra-seats-v2')).status).toBe(204);
    expect((await send('GET', '/addons/extra-seats-v2')).status).toBe(404);
  });

  it('freezes what a version sells while an instance with a live subscription holds it', async () => {
    const grant = await send('POST', '/addons/extra-seats/entitlements', {
      entitlementSlug: 'api-calls',
      value: { type: 'number', value: 1 },
    });
    const price = await send('POST', '/addons/extra-seats/prices', {
      billingModel: 'FLAT_FEE',
      billingPeriod: 'QUARTERLY',
      currency: 'USD',
      unitAmountDecimal: '2500',
    });
    // The draft nobody holds can still be given a grant of its own.
    const free = await send('POST', '/addons/extra-seats-v2/entitlements', {
      entitlementSlug: 'storage-gb',
      value: { type: 'number', value: 10 },
    });

    expect(grant.status).toBe(409);
    expect((await refusal(grant)).code).toBe('AssignAddonEntitlement.BillingActive');
    expect(price.status).toBe(409);
    expect((await refusal(price)).code).toBe('CreateAddonPrice.BillingActive');
    expect(free.status).toBe(201);
  });

  it('checks a grant against the entitlement: its shape, and the overage a number allows', async () => {
    const wrongShape = await send('POST', '/addons/extra-seats-v2/entitlements', {
      entitlementSlug: 'storage-gb',
      value: { type: 'boolean', value: true },
    });
    const overageOnFlag = await send('POST', '/addons/priority-support-pack/entitlements', {
      entitlementSlug: 'advanced-analytics',
      limitCapExceededOveragePercent: 10,
      value: { type: 'boolean', value: true },
    });
    const unknown = await send('POST', '/addons/extra-seats-v2/entitlements', {
      entitlementSlug: 'ghost',
      value: { type: 'number', value: 1 },
    });

    expect((await refusal(wrongShape)).code).toBe('AssignAddonEntitlement.InvalidValue');
    expect(wrongShape.status).toBe(422);
    // The held pack is frozen before its values are read, as the API checks.
    expect((await refusal(overageOnFlag)).code).toBe('AssignAddonEntitlement.BillingActive');
    expect(unknown.status).toBe(404);
    expect((await refusal(unknown)).code).toBe('AssignAddonEntitlement.EntitlementNotFound');
  });

  it('keeps one default price a period: a new default takes the place of the former, and a default is never deprecated', async () => {
    const created = await json<Price>(
      await send('POST', '/addons/extra-seats-v2/prices', {
        billingModel: 'FLAT_FEE',
        billingPeriod: 'MONTHLY',
        currency: 'USD',
        isDefault: true,
        unitAmountDecimal: '1500',
      }),
    );
    const prices = await json<Price[]>(await send('GET', '/addons/extra-seats-v2/prices'));
    const monthly = prices.filter(({ billingPeriod }) => billingPeriod === 'MONTHLY');
    const former = monthly.find(({ id }) => id !== created.id);
    const deprecateDefault = await send(
      'POST',
      `/addons/extra-seats-v2/prices/${created.id}/deprecate`,
    );
    const deprecateFormer = await json<Price>(
      await send('POST', `/addons/extra-seats-v2/prices/${former?.id}/deprecate`),
    );

    expect(monthly.filter(({ isDefault }) => isDefault).map(({ id }) => id)).toEqual([created.id]);
    expect(deprecateDefault.status).toBe(409);
    expect((await refusal(deprecateDefault)).code).toBe('DeprecateAddonPrice.IsDefault');
    expect(deprecateFormer.status).toBe('DEPRECATED');
  });

  it('refuses a price in another currency, and a flat fee with no period', async () => {
    const euro = await send('POST', '/addons/extra-seats-v2/prices', {
      billingModel: 'FLAT_FEE',
      billingPeriod: 'ANNUAL',
      currency: 'EUR',
      unitAmountDecimal: '12000',
    });
    const noPeriod = await send('POST', '/addons/extra-seats-v2/prices', {
      billingModel: 'FLAT_FEE',
      currency: 'USD',
      unitAmountDecimal: '12000',
    });

    expect(euro.status).toBe(422);
    expect((await refusal(euro)).code).toBe('CreateAddonPrice.CurrencyMismatch');
    expect((await refusal(noPeriod)).code).toBe('CreateAddonPrice.BillingPeriodRequired');
  });

  it('declares the license families a version fits, as often as asked', async () => {
    const path = '/addons/priority-support-pack/compatible-license-families';
    const before = await json<{ familySlugs: string[] }>(await send('GET', path));
    const first = await send('PUT', `${path}/enterprise`);
    const again = await send('PUT', `${path}/enterprise`);
    const after = await json<{ familySlugs: string[] }>(await send('GET', path));
    const removed = await send('DELETE', `${path}/enterprise`);
    const unknown = await send('PUT', `${path}/ghost`);

    expect(before.familySlugs).toEqual(['business', 'starter']);
    expect([first.status, again.status]).toEqual([204, 204]);
    expect(after.familySlugs.filter((slug) => slug === 'enterprise')).toHaveLength(1);
    expect(removed.status).toBe(204);
    expect(unknown.status).toBe(404);
    expect((await refusal(unknown)).code).toBe('SetAddonCompatibility.FamilyNotFound');
  });
});

describe('the add-ons an instance holds, as the mocks serve them', () => {
  it('lists what an instance holds with the flat fee its subscription bills for the period', async () => {
    const [seats] = await json<InstanceAddon[]>(
      await send('GET', '/instances/acme-production/addons'),
    );
    const none = await json<InstanceAddon[]>(
      await send('GET', '/instances/gamma-production/addons'),
    );
    const ended = await json<InstanceAddon[]>(
      await send('GET', '/instances/acme-legacy/addons'),
    );
    const history = await json<InstanceAddon[]>(
      await send('GET', '/instances/acme-legacy/addons?includeRemoved=true'),
    );

    expect(seats).toMatchObject({ addonSlug: 'extra-seats', maxQuantity: 10, quantity: 5 });
    // Acme Production pays a year at a time.
    expect(seats?.prices.map(({ billingPeriod }) => billingPeriod)).toEqual(['ANNUAL']);
    expect(none).toEqual([]);
    expect(ended).toEqual([]);
    expect(history.map(({ removedAt }) => Boolean(removedAt))).toEqual([true]);
  });

  it('applies at once: a quantity and an attachment change the effective limits the instance reads', async () => {
    // Starter grants ten seats, two units of five are attached, and the voucher the
    // instance redeemed doubles the sum.
    expect(await limitOf('globex-staging', 'seats')).toEqual({ type: 'number', value: 40 });

    const raised = await send('PATCH', '/instances/globex-staging/addons/extra-seats', {
      quantity: 4,
    });
    expect(raised.status).toBe(200);
    expect(await limitOf('globex-staging', 'seats')).toEqual({ type: 'number', value: 60 });

    const attached = await send('POST', '/instances/globex-staging/addons', {
      addonSlug: 'extra-storage-v2',
      quantity: 2,
    });
    expect(attached.status).toBe(201);
    expect(await limitOf('globex-staging', 'storage-gb')).toEqual({ type: 'number', value: 250 });

    expect((await send('DELETE', '/instances/globex-staging/addons/extra-seats')).status).toBe(204);
    // Without the add-ons, the license's ten, still doubled by the voucher.
    expect(await limitOf('globex-staging', 'seats')).toEqual({ type: 'number', value: 20 });
  });

  it('says why in the usage it serves: the add-ons and the voucher that make the limit, and the license alone once they go', async () => {
    const provenanceOf = async (instanceSlug: string) => {
      const usages = await json<EntitlementUsage[]>(
        await send('GET', `/instances/${instanceSlug}/entitlements/usage`),
      );

      return usages.find(({ entitlementSlug }) => entitlementSlug === 'seats');
    };

    const composed = await provenanceOf('globex-staging');
    expect(composed).toMatchObject({
      limitCapExceededOveragePercent: 0,
      source: 'license',
    });
    expect(composed?.provenance?.number).toEqual({
      afterAddons: 20,
      boostAdd: null,
      boostMultiply: 2,
      boostSet: null,
      effective: 40,
      license: 10,
      unlimited: false,
    });
    expect(composed?.provenance?.addons).toHaveLength(1);
    expect(composed?.provenance?.boosts).toMatchObject([
      { modifierType: 'MULTIPLY', modifierValue: 2 },
    ]);

    // A quantity changes the composition the same moment it changes the limit.
    await send('PATCH', '/instances/globex-staging/addons/extra-seats', { quantity: 4 });
    expect((await provenanceOf('globex-staging'))?.provenance?.number).toMatchObject({
      afterAddons: 30,
      effective: 60,
    });

    // An instance with only its license: the license's grant, and no composition.
    const identity = await provenanceOf('gamma-production');
    expect(identity?.provenance?.number).toBeNull();
    expect(identity?.provenance?.license).toMatchObject({
      value: { type: 'number', value: 10 },
    });
    expect(identity?.provenance?.addons).toEqual([]);
  });

  it('keeps the attachment once removed, as history, and lets the family be attached again', async () => {
    await send('DELETE', '/instances/globex-staging/addons/extra-seats');
    const history = await json<InstanceAddon[]>(
      await send('GET', '/instances/globex-staging/addons?includeRemoved=true'),
    );
    const again = await send('POST', '/instances/globex-staging/addons', {
      addonSlug: 'extra-seats',
    });

    expect(history).toHaveLength(1);
    expect(history[0]?.removedAt).toBeDefined();
    expect(again.status).toBe(201);
    expect((await json<InstanceAddon>(again)).quantity).toBe(1);
  });

  it.each([
    {
      body: { addonSlug: 'extra-seats-v2' },
      code: 'AttachInstanceAddon.AddonNotPublished',
      instance: 'globex-staging',
      status: 422,
      title: 'a draft, on a billed instance',
    },
    {
      body: { addonSlug: 'extra-storage' },
      code: 'AttachInstanceAddon.AddonArchived',
      instance: 'globex-staging',
      status: 422,
      title: 'a version withdrawn from sale',
    },
    {
      body: { addonSlug: 'priority-support-pack', quantity: 2 },
      code: 'AttachInstanceAddon.QuantityExceedsMax',
      instance: 'globex-staging',
      status: 422,
      title: 'more units than the version allows',
    },
    {
      body: { addonSlug: 'priority-support-pack', quantity: 0 },
      code: 'AttachInstanceAddon.InvalidQuantity',
      instance: 'globex-staging',
      status: 422,
      title: 'no unit at all',
    },
    {
      body: { addonSlug: 'extra-storage-v2' },
      code: 'AttachInstanceAddon.Incompatible',
      instance: 'beta-staging',
      status: 422,
      title: 'a version that does not fit the license family',
    },
    {
      body: { addonSlug: 'extra-seats' },
      code: 'AttachInstanceAddon.FamilyAlreadyAttached',
      instance: 'globex-staging',
      status: 409,
      title: 'a second version of a family the instance holds',
    },
    {
      body: { addonSlug: 'ghost' },
      code: 'AttachInstanceAddon.AddonNotFound',
      instance: 'globex-staging',
      status: 404,
      title: 'a version that does not exist',
    },
  ])('refuses to attach $title', async ({ body, code, instance, status }) => {
    const response = await send('POST', `/instances/${instance}/addons`, body);

    expect(response.status).toBe(status);
    expect((await refusal(response)).code).toBe(code);
  });

  it('refuses a quantity above the most the version allows, and an add-on the instance does not hold', async () => {
    const above = await send('PATCH', '/instances/globex-staging/addons/extra-seats', {
      quantity: 11,
    });
    const notHeld = await send('PATCH', '/instances/globex-staging/addons/extra-storage-v2', {
      quantity: 2,
    });
    const detachNotHeld = await send('DELETE', '/instances/globex-staging/addons/extra-storage-v2');

    expect(above.status).toBe(422);
    expect((await refusal(above)).code).toBe('SetInstanceAddonQuantity.QuantityExceedsMax');
    expect(notHeld.status).toBe(404);
    expect((await refusal(notHeld)).code).toBe('SetInstanceAddonQuantity.NotAttached');
    expect((await refusal(detachNotHeld)).code).toBe('DetachInstanceAddon.NotAttached');
  });

  it('takes a version on a billed instance only if it is priced for the period of the subscription', async () => {
    // Acme Production pays a year at a time: the next version of the seats has only a monthly price.
    await send('POST', '/addons/extra-seats-v2/publish');
    await send('PUT', '/addons/extra-seats-v2/compatible-license-families/enterprise');
    await send('DELETE', '/instances/acme-production/addons/extra-seats');
    const response = await send('POST', '/instances/acme-production/addons', {
      addonSlug: 'extra-seats-v2',
    });

    expect(response.status).toBe(422);
    expect((await refusal(response)).code).toBe('AttachInstanceAddon.NoPriceForBillingPeriod');
  });
});

describe('subscribing with add-ons, as the mocks serve it', () => {
  const body = (addOns: Array<{ addonSlug: string; quantity?: number }>) => ({
    addOns,
    basePriceId: 'license-starter-v2-monthly',
    providerKind: 'NOOP',
    trialDays: 0,
  });

  it('attaches them with the subscription and bills them on its first invoice', async () => {
    const response = await send(
      'POST',
      '/instances/gamma-production/billing',
      body([{ addonSlug: 'extra-seats', quantity: 2 }]),
    );
    const started = await json<StartedSubscription>(response);
    const invoice = await json<Invoice>(
      await send('GET', `/invoices/${started.activationInvoice?.id}`),
    );
    const held = await json<InstanceAddon[]>(
      await send('GET', '/instances/gamma-production/addons'),
    );

    expect(response.status).toBe(201);
    expect(invoice.lines.map(({ type }) => type)).toEqual(['BASE', 'ADDON']);
    expect(held).toMatchObject([{ addonSlug: 'extra-seats', quantity: 2 }]);
    expect(await limitOf('gamma-production', 'seats')).toEqual({ type: 'number', value: 20 });
  });

  it('refuses the whole subscription when one add-on is refused, and changes nothing', async () => {
    const response = await send(
      'POST',
      '/instances/gamma-production/billing',
      body([
        { addonSlug: 'extra-seats', quantity: 2 },
        { addonSlug: 'extra-seats-v2' },
      ]),
    );
    const problem = await refusal(response);

    expect(response.status).toBe(422);
    expect(problem.code).toBe('SubscribeInstance.AddonInvalid');
    // The subscribe's words are the same for every reason; the reason is in the
    // error that locates the add-on, with the add-on's own code, as the API puts it.
    expect(problem.detail).toBe('an add-on cannot be attached');
    expect(problem.errors?.[0]?.location).toBe('body.addOns[1]');
    expect(problem.errors?.[0]?.message).toBeTruthy();
    expect(problem.errors?.[0]?.value?.code).toBe('AttachInstanceAddon.AddonNotPublished');
    expect((await send('GET', '/instances/gamma-production/billing')).status).toBe(404);
    expect(
      await json<InstanceAddon[]>(await send('GET', '/instances/gamma-production/addons')),
    ).toEqual([]);
    expect(await limitOf('gamma-production', 'seats')).toEqual({ type: 'number', value: 10 });
  });
});
