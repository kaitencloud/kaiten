import { describe, expect, it } from 'vite-plus/test';
import type { InvoicePreview, Price } from '@/api-client';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import type { LicenseAppModel } from '../../e2e/app/_support/model/license-app-model';
import {
  createBilledCatalogModel,
  createDraftPricesModel,
  createPricedCatalogModel,
} from '../../e2e/app/licenses/licenses.scenarios';
import { server } from './msw-server';

// What the mocks standing in for the license module answer about prices: they
// refuse as the API does, with its codes, because the console is tested against
// them. These read the answers off the wire, as the console does.

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

const code = async (response: Response) =>
  ((await response.json()) as { code?: string }).code;

const FLAT = {
  billingModel: 'FLAT_FEE',
  billingPeriod: 'MONTHLY',
  currency: 'USD',
  unitAmountDecimal: '4900',
};

describe('the prices of a license version, as the mocks serve them', () => {
  it('lists them in display order, then by id, with their status', async () => {
    install(createPricedCatalogModel());

    const prices = (await (await send('GET', '/licenses/pro-v2/prices')).json()) as Price[];

    expect(prices.map(({ id, status }) => [id, status])).toEqual([
      ['price-1-base', 'ACTIVE'],
      ['price-3-annual', 'DEPRECATED'],
      ['price-2-over', 'ACTIVE'],
    ]);
  });

  it('filters the list by status', async () => {
    install(createPricedCatalogModel());

    const prices = (await (
      await send('GET', '/licenses/pro-v2/prices?status=DEPRECATED')
    ).json()) as Price[];

    expect(prices.map(({ id }) => id)).toEqual(['price-3-annual']);
  });

  it('creates a flat fee on a draft, in minor units', async () => {
    install(createPricedCatalogModel());

    const response = await send('POST', '/licenses/pro-v4/prices', {
      ...FLAT,
      billingTiming: 'ADVANCE',
      displayLabel: 'Pro monthly',
      isDefault: true,
    });
    const price = (await response.json()) as Price;

    expect(response.status).toBe(201);
    expect(price).toMatchObject({
      billingModel: 'FLAT_FEE',
      billingPeriod: 'MONTHLY',
      billingTiming: 'ADVANCE',
      isDefault: true,
      status: 'ACTIVE',
      unitAmount: 4900,
      unitAmountDecimal: '4900',
    });
    expect(
      ((await (await send('GET', '/licenses/pro-v4/prices')).json()) as Price[]).length,
    ).toBe(1);
  });

  it('snapshots the sale unit of the entitlement a metered price measures', async () => {
    install(createPricedCatalogModel());

    const response = await send('POST', '/licenses/pro-v4/prices', {
      billingModel: 'USAGE_BASED',
      currency: 'USD',
      meteredEntitlementSlug: 'requests',
      unitAmountDecimal: '150',
    });

    expect(await response.json()).toMatchObject({
      billingTiming: 'ARREARS',
      metered: { entitlementSlug: 'requests', saleUnitFactor: '1000', saleUnitSingular: '1k requests' },
    });
  });

  describe.each([
    [
      'an entitlement that is a stock',
      { billingModel: 'USAGE_BASED', meteredEntitlementSlug: 'seats' },
      422,
      'CreateLicensePrice.EntitlementIsStock',
    ],
    [
      'an average',
      { billingModel: 'USAGE_BASED', meteredEntitlementSlug: 'latency' },
      422,
      'CreateLicensePrice.UnsupportedAggregation',
    ],
    [
      'a flag',
      { billingModel: 'USAGE_BASED', meteredEntitlementSlug: 'sso' },
      422,
      'CreateLicensePrice.EntitlementIsStock',
    ],
    [
      'an overage on a hard limit',
      { billingModel: 'OVERAGE', meteredEntitlementSlug: 'requests' },
      422,
      'CreateLicensePrice.OverageUnreachable',
    ],
    [
      'an overage on an unlimited grant',
      { billingModel: 'OVERAGE', meteredEntitlementSlug: 'credits' },
      422,
      'CreateLicensePrice.OverageUnreachable',
    ],
    [
      'a metered price billed in advance',
      { billingModel: 'USAGE_BASED', billingTiming: 'ADVANCE', meteredEntitlementSlug: 'traces' },
      422,
      'CreateLicensePrice.InvalidTiming',
    ],
    [
      'a flat fee with no period',
      { billingModel: 'FLAT_FEE' },
      422,
      'CreateLicensePrice.InvalidPeriod',
    ],
    [
      'an amount with too many decimals',
      { ...FLAT, unitAmountDecimal: '1.0000000000001' },
      422,
      'CreateLicensePrice.InvalidAmount',
    ],
    [
      'a currency that is not an ISO code',
      { ...FLAT, currency: 'usd' },
      422,
      'CreateLicensePrice.InvalidCurrency',
    ],
  ])('refuses %s', (_name, body, status, expected) => {
    it(`with ${status} ${expected}`, async () => {
      install(createPricedCatalogModel());

      const response = await send('POST', '/licenses/pro-v4/prices', {
        currency: 'USD',
        unitAmountDecimal: '100',
        ...body,
      });

      expect(response.status).toBe(status);
      expect(await code(response)).toBe(expected);
    });
  });

  it('refuses a second ACTIVE price on the same meter', async () => {
    install(createDraftPricesModel());

    const response = await send('POST', '/licenses/pro-v4/prices', {
      billingModel: 'OVERAGE',
      currency: 'USD',
      meteredEntitlementSlug: 'requests',
      unitAmountDecimal: '100',
    });

    // The entitlement is a hard limit: that refusal comes first, as in the API.
    expect(await code(response)).toBe('CreateLicensePrice.OverageUnreachable');
    const usage = await send('POST', '/licenses/pro-v4/prices', {
      billingModel: 'USAGE_BASED',
      currency: 'USD',
      meteredEntitlementSlug: 'requests',
      unitAmountDecimal: '100',
    });
    expect(await code(usage)).toBe('CreateLicensePrice.EntitlementAlreadyMetered');
  });

  it('keeps one currency per version', async () => {
    install(createDraftPricesModel());

    const response = await send('POST', '/licenses/pro-v4/prices', {
      ...FLAT,
      billingPeriod: 'ANNUAL',
      currency: 'EUR',
    });

    expect(response.status).toBe(422);
    expect(await code(response)).toBe('CreateLicensePrice.CurrencyMismatch');
  });

  it('refuses a second default for the same period', async () => {
    install(createDraftPricesModel());

    const response = await send('POST', '/licenses/pro-v4/prices', { ...FLAT, isDefault: true });

    expect(response.status).toBe(409);
    expect(await code(response)).toBe('CreateLicensePrice.DefaultConflict');
  });

  it('takes no price on an archived version, and none on a billed one', async () => {
    install(createBilledCatalogModel());

    const archived = await send('POST', '/licenses/pro/prices', FLAT);
    const billed = await send('POST', '/licenses/pro-v2/prices', { ...FLAT, billingPeriod: 'QUARTERLY' });

    expect(await code(archived)).toBe('CreateLicensePrice.VersionArchived');
    expect(billed.status).toBe(409);
    expect(await code(billed)).toBe('CreateLicensePrice.BillingActive');
  });

  it('adds a price to a published version that is not billed', async () => {
    install(createPricedCatalogModel());

    const response = await send('POST', '/licenses/pro-v2/prices', { ...FLAT, billingPeriod: 'QUARTERLY' });

    expect(response.status).toBe(201);
  });

  it('edits a price of a draft, and refuses to edit a published one', async () => {
    install(createPricedCatalogModel());
    await send('POST', '/licenses/pro-v4/prices', FLAT);
    const [created] = (await (await send('GET', '/licenses/pro-v4/prices')).json()) as Price[];

    const edited = await send('PATCH', `/licenses/pro-v4/prices/${created.id}`, {
      displayLabel: 'Pro, monthly (new)',
      unitAmountDecimal: '5900',
    });
    const published = await send('PATCH', '/licenses/pro-v2/prices/price-2-over', {
      unitAmountDecimal: '900',
    });

    expect(await edited.json()).toMatchObject({
      displayLabel: 'Pro, monthly (new)',
      unitAmountDecimal: '5900',
    });
    expect(published.status).toBe(409);
    expect(await code(published)).toBe('UpdateLicensePrice.VersionNotDraft');
  });

  it('deprecates a price, clears its default flag, and refuses to do it twice', async () => {
    install(createPricedCatalogModel());

    const first = await send('POST', '/licenses/pro-v2/prices/price-1-base/deprecate');
    const second = await send('POST', '/licenses/pro-v2/prices/price-1-base/deprecate');

    expect(await first.json()).toMatchObject({ isDefault: false, status: 'DEPRECATED' });
    expect(second.status).toBe(409);
    expect(await code(second)).toBe('DeprecateLicensePrice.AlreadyDeprecated');
  });

  it('keeps a grant an active price meters, on a draft too, until the price is deprecated', async () => {
    install(createDraftPricesModel());

    // The usage price of the draft meters requests.
    const refused = await send('DELETE', '/licenses/pro-v4/entitlements/requests');
    await send('POST', '/licenses/pro-v4/prices/price-2-usage/deprecate');
    const removed = await send('DELETE', '/licenses/pro-v4/entitlements/requests');
    const unmetered = await send('DELETE', '/licenses/pro-v4/entitlements/traces');

    expect(refused.status).toBe(409);
    expect(await code(refused)).toBe('DeleteLicenseEntitlement.MeteredByPrice');
    expect(removed.status).toBe(204);
    expect(unmetered.status).toBe(204);
  });

  it('deletes a version once it grants nothing, which takes its prices and its family with it', async () => {
    install(createDraftPricesModel());
    const grants = (await (await send('GET', '/licenses/pro-v4/entitlements')).json()) as {
      items: Array<{ entitlementSlug: string }>;
    };

    const refused = await send('DELETE', '/licenses/pro-v4');
    await send('POST', '/licenses/pro-v4/prices/price-2-usage/deprecate');
    for (const { entitlementSlug } of grants.items) {
      await send('DELETE', `/licenses/pro-v4/entitlements/${entitlementSlug}`);
    }
    const deleted = await send('DELETE', '/licenses/pro-v4');
    const versions = (await (await send('GET', '/licenses')).json()) as { items: unknown[] };
    const families = (await (await send('GET', '/license-families')).json()) as {
      items: unknown[];
    };

    expect(refused.status).toBe(409);
    expect(await code(refused)).toBe('DeleteLicense.InUseConflict');
    expect(deleted.status).toBe(204);
    // The only version of its family: the family goes with it.
    expect(versions.items).toEqual([]);
    expect(families.items).toEqual([]);
    expect((await send('DELETE', '/licenses/pro-v4')).status).toBe(404);
  });

  it('answers a forced refusal once, as a problem document', async () => {
    const model = createPricedCatalogModel();
    model.setNextProblem('deprecatePrice', {
      code: 'DeprecateLicensePrice.PlanChangeTarget',
      detail: 'a scheduled plan change targets this price',
      status: 409,
    });
    install(model);

    const forced = await send('POST', '/licenses/pro-v2/prices/price-2-over/deprecate');
    const next = await send('POST', '/licenses/pro-v2/prices/price-2-over/deprecate');

    expect(forced.status).toBe(409);
    expect(await forced.json()).toMatchObject({
      code: 'DeprecateLicensePrice.PlanChangeTarget',
      detail: 'a scheduled plan change targets this price',
    });
    expect(next.status).toBe(200);
  });
});

describe('the invoice preview of a license version, as the mocks compose it', () => {
  const preview = async (body: unknown, slug = 'pro-v2') => {
    const response = await send('POST', `/licenses/${slug}/invoice-preview`, body);

    return { body: await response.json(), status: response.status };
  };

  it('rates the sample usage above the allowance, and the base for the period that starts', async () => {
    install(createPricedCatalogModel());

    const { body, status } = await preview({
      sampleUsage: [{ entitlementSlug: 'traces', quantity: '172345' }],
    });
    const invoice = body as InvoicePreview;

    expect(status).toBe(200);
    expect(invoice).toMatchObject({
      currency: 'USD',
      discountTotal: 0,
      kind: 'RENEWAL',
      status: 'PREVIEW',
      subtotal: 3479,
      total: 3479,
    });
    // The period that ends is billed in arrears, the one that starts in
    // advance: the overage line is listed first, as its period starts earlier.
    expect(invoice.lines.map((line) => [line.seq, line.type, line.amount])).toEqual([
      [1, 'OVERAGE', 579],
      [2, 'BASE', 2900],
    ]);
    expect(invoice.lines[0]).toMatchObject({
      label: 'Traces, overage',
      quantity: '0.72345',
      unitAmountDecimal: '800',
    });
    expect(invoice.lines[0].description).toBe(
      '0.72345 × 8.00 USD (per 100,000 traces); 172,345 used; 72,345 above the applied limit (100,000)',
    );
  });

  it('caps a sample above what the license accepts, and says so', async () => {
    install(createPricedCatalogModel());

    const { body } = await preview({
      sampleUsage: [{ entitlementSlug: 'traces', quantity: '400000' }],
    });
    const invoice = body as InvoicePreview;

    // 100,000 granted at 100%: 200,000 are accepted, 100,000 of them above the limit.
    expect(invoice.lines[0]).toMatchObject({ amount: 800, capped: true, quantity: '1' });
    expect(invoice.lines[0].description).toContain('sample capped at what the licence accepts');
  });

  it('produces no usage line for an entitlement left out, nor for one within its allowance', async () => {
    install(createPricedCatalogModel());

    const left = ((await preview({})).body as InvoicePreview).lines;
    const within = ((await preview({ sampleUsage: [{ entitlementSlug: 'traces', quantity: '90000' }] }))
      .body as InvoicePreview).lines;

    expect(left.map((line) => line.type)).toEqual(['BASE']);
    expect(within.map((line) => line.type)).toEqual(['BASE']);
  });

  it('refuses a sample that is not a non-negative decimal, or names an entitlement twice', async () => {
    install(createPricedCatalogModel());

    const negative = await preview({ sampleUsage: [{ entitlementSlug: 'traces', quantity: '-1' }] });
    const twice = await preview({
      sampleUsage: [
        { entitlementSlug: 'traces', quantity: '1' },
        { entitlementSlug: 'traces', quantity: '2' },
      ],
    });

    expect(negative.status).toBe(422);
    expect(negative.body).toMatchObject({ code: 'PreviewLicenseInvoice.InvalidSampleUsage' });
    expect(twice.body).toMatchObject({ code: 'PreviewLicenseInvoice.InvalidSampleUsage' });
  });

  it('refuses a version with no default base price, and an unknown base price', async () => {
    install(createPricedCatalogModel());

    const none = await preview({}, 'pro-v4');
    const unknown = await preview({ basePriceId: 'price-nope' });

    expect(none.status).toBe(422);
    expect(none.body).toMatchObject({ code: 'PreviewLicenseInvoice.NoBasePrice' });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({ code: 'PreviewLicenseInvoice.PriceNotFound' });
  });
});
