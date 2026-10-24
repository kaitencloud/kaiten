import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { InvoicePreview } from '@/api-client';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import { BILLED_NOW } from '../../e2e/app/billing/billed-instances';
import { initechTokens } from '../../e2e/app/licenses/licenses.preview-world';
import {
  createVouchersBillingModel,
  createVouchersInstancesModel,
  createVouchersLicensesModel,
} from '../../e2e/app/vouchers/vouchers.scenarios';
import { server } from './msw-server';

// What the mock of the invoice preview of a license version answers when it names an
// instance, add-ons and a voucher: the same lines, the same totals and the same refusals,
// with the same codes, as the API composes, because the console is tested against
// it. These read the answers off the wire, over the three slots that hold what a preview
// names: the licenses, the billing (the add-ons and the vouchers) and the instances (their
// journal of usage).

const API = 'http://api.test/api';

const install = (retentionStart?: string, slots: Array<'billing' | 'instances'> = ['billing', 'instances']) => {
  const config: E2EMswConfig = {
    billing: slots.includes('billing')
      ? createVouchersBillingModel().serializeForMsw()
      : undefined,
    instances: slots.includes('instances')
      ? createVouchersInstancesModel({
          retentionStart,
          usageReports: { 'initech-prod': { tokens: initechTokens() } },
        }).serializeForMsw()
      : undefined,
    licenses: createVouchersLicensesModel().serializeForMsw(),
  };
  server.use(
    ...createMockHandlers(config, 'off', undefined, true),
    undeclaredApiRequest,
  );
};

const preview = async (body: unknown, slug = 'pro') => {
  const response = await fetch(`${API}/licenses/${slug}/invoice-preview`, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  return { body: await response.json(), status: response.status };
};

const lines = (result: { body: unknown }) =>
  (result.body as InvoicePreview).lines.map(
    ({ amount, label, type }) => [type, label, amount] as const,
  );

const refusal = (result: { body: unknown; status: number }) => ({
  code: (result.body as { code?: string }).code,
  status: result.status,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(BILLED_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the add-ons a preview prices in', () => {
  it('bills the fee of each for the period of the base, in the units listed', async () => {
    install();

    const result = await preview({
      addOns: [{ addonSlug: 'extra-seats-v1', quantity: 2 }],
    });

    expect(lines(result)).toEqual([
      ['BASE', 'Pro, monthly', 9900],
      ['ADDON', 'Extra seat, monthly', 2000],
    ]);
    const [, seats] = (result.body as InvoicePreview).lines;
    expect(seats).toMatchObject({
      addonId: 'addon-extra-seats-v1',
      addonPriceId: 'price-seats-monthly',
      instanceAddonId: null,
      licensePriceId: null,
      quantity: '2',
    });
    expect((result.body as InvoicePreview).total).toBe(11900);
  });

  it('rates the sample against the limit the license and the add-ons grant together, and caps it there', async () => {
    install();

    const result = await preview({
      addOns: [{ addonSlug: 'extra-tokens-v1', quantity: 1 }],
      sampleUsage: [{ entitlementSlug: 'tokens', quantity: '150000' }],
    });

    // 100,000 and 10,000 more: 110,000, and the overage of the add-on, twenty percent of
    // its own, accepts up to 132,000. The sample is capped there, at a tenth of a cent a token.
    const usage = (result.body as InvoicePreview).lines.find(
      ({ type }) => type === 'USAGE',
    );
    expect(usage).toMatchObject({
      addonPriceId: 'price-tokens-metered',
      amount: 13200,
      capped: true,
      licensePriceId: null,
      quantity: '132000',
      type: 'USAGE',
    });
  });

  it('refuses a version it does not know, a repeated one and units below one', async () => {
    install();

    expect(
      refusal(
        await preview({ addOns: [{ addonSlug: 'nowhere-v9', quantity: 1 }] }),
      ),
    ).toEqual({ code: 'PreviewLicenseInvoice.AddonNotFound', status: 404 });
    expect(
      refusal(
        await preview({
          addOns: [
            { addonSlug: 'extra-seats-v1', quantity: 1 },
            { addonSlug: 'extra-seats-v1', quantity: 2 },
          ],
        }),
      ),
    ).toEqual({ code: 'PreviewLicenseInvoice.InvalidAddOns', status: 422 });
    expect(
      refusal(
        await preview({ addOns: [{ addonSlug: 'extra-seats-v1', quantity: 0 }] }),
      ),
    ).toEqual({ code: 'PreviewLicenseInvoice.InvalidAddOns', status: 422 });
  });

  it('knows no add-on where the organization has none', async () => {
    install(undefined, []);

    expect(
      refusal(
        await preview({ addOns: [{ addonSlug: 'extra-seats-v1', quantity: 1 }] }),
      ),
    ).toEqual({ code: 'PreviewLicenseInvoice.AddonNotFound', status: 404 });
  });
});

describe('the instance a preview rates', () => {
  it('rates the usage the instance made since its period began, by the metered prices of the add-ons', async () => {
    install();

    const result = await preview({
      addOns: [{ addonSlug: 'extra-tokens-v1', quantity: 1 }],
      instanceSlug: 'initech-prod',
    });

    // September's window moved 110,000 (floored at nothing it stays), October's 5,000.
    const usage = (result.body as InvoicePreview).lines.find(
      ({ type }) => type === 'USAGE',
    );
    expect(usage).toMatchObject({
      amount: 11500,
      quantity: '115000',
      serviceFrom: '2026-09-15T00:00:00.000Z',
      serviceTo: BILLED_NOW,
    });
    expect(lines(result).map(([type]) => type)).toEqual([
      'USAGE',
      'BASE',
      'ADDON',
    ]);
  });

  it('refuses a sample beside it, and an instance it does not know', async () => {
    install();

    expect(
      refusal(
        await preview({
          instanceSlug: 'initech-prod',
          sampleUsage: [{ entitlementSlug: 'tokens', quantity: '5' }],
        }),
      ),
    ).toEqual({ code: 'PreviewLicenseInvoice.InvalidSampleUsage', status: 422 });
    expect(refusal(await preview({ instanceSlug: 'nobody' }))).toEqual({
      code: 'PreviewLicenseInvoice.InstanceNotFound',
      status: 404,
    });
  });

  it('refuses a period that began before the usage that is kept, with where it begins', async () => {
    install('2026-10-01T00:00:00.000Z');

    // The tokens are metered by the price of the add-on: with it listed there is usage to read.
    const result = await preview({
      addOns: [{ addonSlug: 'extra-tokens-v1', quantity: 1 }],
      instanceSlug: 'initech-prod',
    });

    expect(refusal(result)).toEqual({
      code: 'PreviewLicenseInvoice.OutsideRetention',
      status: 422,
    });
    expect(
      (result.body as { errors: Array<{ location: string; value: string }> })
        .errors[0],
    ).toMatchObject({
      location: 'retentionStart',
      value: '2026-10-01T00:00:00.000Z',
    });
  });
});

describe('what a preview meters', () => {
  it('reads no history, and so refuses none, of an invoice that meters nothing', async () => {
    install('2026-10-01T00:00:00.000Z');

    // No price of the version meters anything and no add-on is listed: there is no usage
    // to read, however far back the history that is kept begins.
    const result = await preview({ instanceSlug: 'initech-prod' });

    expect(result.status).toBe(200);
    expect(lines(result)).toEqual([['BASE', 'Pro, monthly', 9900]]);
  });

  it('takes a sample only for an entitlement an active metered price measures', async () => {
    install();

    // The version grants tokens as a number, but nothing meters them until an add-on does.
    expect(
      refusal(
        await preview({
          sampleUsage: [{ entitlementSlug: 'tokens', quantity: '5' }],
        }),
      ),
    ).toEqual({ code: 'PreviewLicenseInvoice.InvalidSampleUsage', status: 422 });
    expect(
      (
        await preview({
          addOns: [{ addonSlug: 'extra-tokens-v1', quantity: 1 }],
          sampleUsage: [{ entitlementSlug: 'tokens', quantity: '5' }],
        })
      ).status,
    ).toBe(200);
  });

  it('applies a voucher once the usage is read: of two faults, the usage is the one refused', async () => {
    install('2026-10-01T00:00:00.000Z');

    const result = await preview({
      addOns: [{ addonSlug: 'extra-tokens-v1', quantity: 1 }],
      instanceSlug: 'initech-prod',
      voucherCode: 'NO-SUCH-CODE',
    });

    expect(refusal(result)).toEqual({
      code: 'PreviewLicenseInvoice.OutsideRetention',
      status: 422,
    });
  });
});

describe('the voucher a preview applies', () => {
  it('takes the discount the code gives off the lines it bears on, consuming nothing', async () => {
    install();

    // The welcome promotion takes twenty percent off the base price. A code is matched as
    // the API matches it: with everything but its letters and digits dropped.
    const result = await preview({ voucherCode: 'welcome spring 2027' });

    expect(lines(result)).toEqual([
      ['BASE', 'Pro, monthly', 9900],
      ['DISCOUNT', 'Welcome spring', -1980],
    ]);
    const body = result.body as InvoicePreview;
    expect(body).toMatchObject({
      discountTotal: 1980,
      subtotal: 9900,
      total: 7920,
    });
    // No redemption exists, and a preview has no identifiers.
    expect(body.lines[1].instanceVoucherId).toBeNull();
    expect(body.lines[1].id).toBeUndefined();
    // Nothing was redeemed: the voucher counts the same redemptions as before.
    const vouchers = (await (await fetch(`${API}/vouchers`)).json()) as {
      items: Array<{ code?: string; redemptionsCount: number }>;
    };
    expect(
      vouchers.items.find(({ code }) => code === 'WELCOME-SPRING-2027')
        ?.redemptionsCount,
    ).toBe(2);
  });

  it('refuses a code no voucher has, and a voucher that is not an active price voucher', async () => {
    install();

    expect(refusal(await preview({ voucherCode: 'NO-SUCH-CODE' }))).toEqual({
      code: 'PreviewLicenseInvoice.VoucherNotFound',
      status: 404,
    });
    // A draft, an archived one, and a boost.
    for (const code of [
      'SUMMER-SALE-2027',
      'BLACK-FRIDAY-2025',
      'LAUNCH-BOOST-50K',
    ]) {
      expect(refusal(await preview({ voucherCode: code }))).toEqual({
        code: 'PreviewLicenseInvoice.VoucherInvalid',
        status: 422,
      });
    }
  });
});
