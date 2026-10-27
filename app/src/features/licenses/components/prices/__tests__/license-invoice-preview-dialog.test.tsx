import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Instance, InvoicePreviewScenario, License } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetInstances,
  handleListAddonPrices,
  handleListAddons,
  handlePreviewLicenseInvoice,
} from '@/api-client/msw.gen';
import {
  pageOf,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { storyInvoicePreview } from '@/test-fixtures/storybook-billing-fixtures';
import {
  buildAddon,
  buildEntitlement,
  buildPrice,
} from '../../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../../e2e/app/_support/model/billing-capabilities';
import type { useLicensePricing } from '../../../hooks/use-license-pricing';
import { getPriceRules } from '../../../utils/license-price.utils';
import { LicenseInvoicePreviewDialog } from '../license-invoice-preview-dialog';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

useBillingTexts();

const LICENSE = {
  id: 'license-pro',
  name: 'Pro',
  slug: 'pro',
  version: '1',
} as License;
const BASE = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Pro, monthly',
  id: 'price-pro-monthly',
  isDefault: true,
  unitAmountDecimal: '9900',
});
const TRACES = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Traces',
  resetPeriod: 'MONTH',
  slug: 'traces',
});
const TOKENS = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Tokens',
  resetPeriod: 'MONTH',
  slug: 'tokens',
});
const OVERAGE = buildPrice({
  billingModel: 'OVERAGE',
  displayLabel: 'Traces, overage',
  id: 'price-pro-traces',
  metered: { entitlementSlug: 'traces', saleUnitFactor: '1', saleUnitPlural: null, saleUnitSingular: null },
  unitAmountDecimal: '8',
});

// The pricing of a version, as the page reads it: the version, its prices and the
// catalogue of entitlements they are metered from.
const pricing = {
  currency: 'USD',
  entitlementBySlug: new Map([
    ['tokens', TOKENS],
    ['traces', TRACES],
  ]),
  entitlements: [TRACES, TOKENS],
  grantBySlug: new Map(),
  grants: [],
  license: LICENSE,
  prices: [BASE, OVERAGE],
  rules: getPriceRules(LICENSE),
} as unknown as ReturnType<typeof useLicensePricing>;

const SEATS = buildAddon({
  familySlug: 'extra-seats',
  name: 'Extra seats',
  slug: 'extra-seats-v1',
  versionName: '2026',
});
const TOKENS_PACK = buildAddon({
  familySlug: 'extra-tokens',
  name: 'Extra tokens',
  slug: 'extra-tokens-v1',
  versionName: '2026',
});
const ADDON_PRICES = {
  'extra-seats-v1': [
    buildPrice({
      billingPeriod: 'MONTHLY',
      id: 'price-seats',
      isDefault: true,
      unitAmountDecimal: '1000',
    }),
  ],
  'extra-tokens-v1': [
    buildPrice({
      billingModel: 'USAGE_BASED',
      id: 'price-tokens',
      metered: { entitlementSlug: 'tokens', saleUnitFactor: '1', saleUnitPlural: null, saleUnitSingular: null },
      unitAmountDecimal: '0.1',
    }),
  ],
} as const;

const instance = (slug: string, name: string) =>
  ({ id: `id-${slug}`, name, slug }) as Instance;

const SCOPES = ['read:licenses', 'read:instances', 'read:addons'];

/** What the API was asked, in order. */
const asked: InvoicePreviewScenario[] = [];

function serve({
  capabilities = billingCapabilitiesProfiles.stackWithVouchers(),
  answer = () => HttpResponse.json(storyInvoicePreview),
}: {
  capabilities?: ReturnType<typeof billingCapabilitiesProfiles.stackWithVouchers>;
  answer?: () => Response;
} = {}) {
  asked.length = 0;
  server.use(
    handleGetBillingCapabilities({ body: capabilities }),
    handleGetInstances({
      body: pageOf([
        instance('initech-prod', 'Initech Production'),
        instance('hooli-starter', 'Hooli Starter'),
      ]),
    }),
    handleListAddons({ body: pageOf([SEATS, TOKENS_PACK]) }),
    handleListAddonPrices(({ params }) =>
      HttpResponse.json(
        ADDON_PRICES[params.addonSlug as keyof typeof ADDON_PRICES],
      ),
    ),
    handlePreviewLicenseInvoice(async ({ request }) => {
      asked.push((await request.json()) as InvoicePreviewScenario);

      return answer();
    }),
  );
}

/**
 * Opens the dialog. What the release ships and the session may do decides what it offers
 * beyond the samples, and is read once the dialog is up: `offers` says what to wait for.
 */
async function openDialog(
  scopes: string[] = SCOPES,
  { offers = true }: { offers?: boolean } = {},
) {
  getAuthToken.mockResolvedValue(sessionToken(scopes));
  const rendered = renderWithClient(
    <LicenseInvoicePreviewDialog
      licenseSlug="pro"
      onClose={vi.fn()}
      pricing={pricing}
    />,
  );
  await screen.findByRole('button', { name: 'Run preview' });
  if (offers) {
    await screen.findByLabelText('Promo code');
    await screen.findByRole('button', { name: 'Add an add-on' });
  }

  return rendered;
}

/** The problem the dialog shows under its form, for a refusal that is about no field of it. */
const problemUnderTheForm = () =>
  document.querySelector('[data-slot="alert"][data-kind]');

const run = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Run preview' }));
};

const choose = async (name: string | RegExp, option: string) => {
  await userEvent.click(await screen.findByRole('button', { name }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
};

beforeEach(() => {
  serve();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what the preview of an invoice offers', () => {
  it('offers the usage of an instance, the add-ons and a code where the session and the release have them', async () => {
    await openDialog();

    expect(screen.getByRole('group', { name: 'Usage' })).toBeInTheDocument();
    // The list of add-ons is a group a screen reader can name, not a label that labels nothing.
    expect(screen.getByRole('group', { name: 'Add-ons' })).toBeInTheDocument();
    expect(screen.getByLabelText('Promo code')).toBeInTheDocument();
  });

  it('offers none of them to a session that may not list the instances nor read the add-ons, on a release without vouchers', async () => {
    serve({ capabilities: billingCapabilitiesProfiles.stack() });
    await openDialog(['read:licenses'], { offers: false });
    // Let what was asked of the release be answered before looking for what is not there.
    await waitFor(() => expect(screen.getByLabelText('Traces')).toBeInTheDocument());

    expect(screen.queryByRole('group', { name: 'Usage' })).not.toBeInTheDocument();
    expect(screen.queryByText('Add-ons')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Promo code')).not.toBeInTheDocument();
    // What it always offered stays: a sample for what the version meters.
    expect(screen.getByLabelText('Traces')).toBeInTheDocument();
  });

  it('rates the samples or an instance, one at a time: the fields of the other are not there, and nothing hidden is sent', async () => {
    await openDialog();
    await userEvent.type(screen.getByLabelText('Traces'), '172345');

    await userEvent.click(screen.getByRole('button', { name: /An instance/ }));
    expect(screen.queryByLabelText('Traces')).not.toBeInTheDocument();
    // An instance has to be chosen to run.
    expect(await screen.findByText('Fill in the required fields')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run preview' })).toHaveAttribute('aria-disabled', 'true');
    expect(asked).toEqual([]);

    await choose(/Choose an instance/, 'Initech Production (initech-prod)');
    await run();
    await waitFor(() => expect(asked).toHaveLength(1));
    // The sample typed before is not sent beside the instance.
    expect(asked[0]).toEqual({ instanceSlug: 'initech-prod' });

    await userEvent.click(screen.getByRole('button', { name: /Samples/ }));
    expect(screen.getByLabelText('Traces')).toHaveValue('172345');
    await run();
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(asked[1]).toEqual({
      sampleUsage: [{ entitlementSlug: 'traces', quantity: '172345' }],
    });
  });
});

describe('the add-ons of a preview', () => {
  it('lists them with their units, and sends each once', async () => {
    await openDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Add an add-on' }));
    await choose(/Choose an add-on/, 'Extra seats · 2026');
    const units = screen.getByLabelText(/^Units/);
    await userEvent.clear(units);
    await userEvent.type(units, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Add an add-on' }));
    await userEvent.click(
      within(screen.getAllByTestId('preview-addon-row')[1]).getByRole('button', {
        name: /Choose an add-on/,
      }),
    );
    // The version of the first row is not offered to the second.
    expect(screen.queryByRole('option', { name: 'Extra seats · 2026' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: 'Extra tokens · 2026' }));
    await run();

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0].addOns).toEqual([
      { addonSlug: 'extra-seats-v1', quantity: 3 },
      { addonSlug: 'extra-tokens-v1', quantity: 1 },
    ]);
  });

  it('takes a row off the list, and asks a version of one that has none', async () => {
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Add an add-on' }));

    // The row has no version yet: nothing can be run until it has one, or is taken off.
    expect(await screen.findByText('Fill in the required fields')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run preview' })).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Remove add-on 1' }));
    expect(screen.queryByTestId('preview-addon-row')).not.toBeInTheDocument();
  });

  it('offers a sample for what an add-on in the list meters, and leaves it out when the add-on is taken off', async () => {
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Add an add-on' }));
    await choose(/Choose an add-on/, 'Extra tokens · 2026');

    const tokens = await screen.findByLabelText('Tokens');
    await userEvent.type(tokens, '150000');
    await run();
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0].sampleUsage).toEqual([
      { entitlementSlug: 'tokens', quantity: '150000' },
    ]);

    // Without the add-on there is nothing that rates the tokens: the sample is not sent.
    await userEvent.click(screen.getByRole('button', { name: 'Remove add-on 1' }));
    expect(screen.queryByLabelText('Tokens')).not.toBeInTheDocument();
    await run();
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(asked[1].sampleUsage).toBeUndefined();
  });
});

describe('the code of a voucher', () => {
  it('is sent in the body, trimmed, and in no address, storage, key or log', async () => {
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];
    const { client } = await openDialog();

    await userEvent.type(screen.getByLabelText('Promo code'), '  WELCOME-SPRING-2027 ');
    await run();

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0].voucherCode).toBe('WELCOME-SPRING-2027');
    await screen.findByRole('region', { name: 'Invoice preview' });
    const kept = [
      window.location.href,
      JSON.stringify({ ...window.localStorage }),
      JSON.stringify({ ...window.sessionStorage }),
      JSON.stringify(client.getQueryCache().getAll().map((query) => query.queryKey)),
      JSON.stringify(
        client.getMutationCache().getAll().map((mutation) => mutation.options.mutationKey),
      ),
      JSON.stringify(logs.map((log) => log.mock.calls)),
    ].join('\n');
    expect(kept).not.toContain('WELCOME');
    // The field says the browser is not to remember it.
    expect(screen.getByLabelText('Promo code')).toHaveAttribute('autocomplete', 'off');
  });
});

describe('what the API refuses of a preview', () => {
  const REFUSALS = [
    {
      code: 'PreviewLicenseInvoice.VoucherNotFound',
      detail: 'no voucher has this code',
      status: 404,
    },
    {
      code: 'PreviewLicenseInvoice.VoucherInvalid',
      detail: 'the voucher is not an ACTIVE PRICE voucher',
      status: 422,
    },
  ] as const;

  it.each(REFUSALS)('shows $code on the code, in the API’s words', async (problem) => {
    serve({ answer: () => refusal(problem.status, problem) });
    await openDialog();

    await userEvent.type(screen.getByLabelText('Promo code'), 'NOPE');
    await run();

    const field = screen.getByLabelText('Promo code').closest('[data-field-name]') as HTMLElement;
    expect(await within(field).findByText(problem.detail)).toBeInTheDocument();
    // It is about the field, so it is not repeated under the form.
    expect(problemUnderTheForm()).toBeNull();
  });

  it.each([
    ['PreviewLicenseInvoice.AddonNotFound', 404, 'add-on "gone" not found'],
    ['PreviewLicenseInvoice.InvalidAddOns', 422, 'add-on "extra-seats-v1" is listed twice'],
  ] as const)('shows %s under the list of add-ons', async (code, status, detail) => {
    serve({ answer: () => refusal(status, { code, detail }) });
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Add an add-on' }));
    await choose(/Choose an add-on/, 'Extra seats · 2026');
    await run();

    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Add-ons' })).toHaveAccessibleDescription(
      expect.stringContaining(detail),
    );
    expect(problemUnderTheForm()).toBeNull();
  });

  it('shows an instance it does not know on the instance', async () => {
    serve({
      answer: () =>
        refusal(404, {
          code: 'PreviewLicenseInvoice.InstanceNotFound',
          detail: 'instance "initech-prod" not found',
        }),
    });
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: /An instance/ }));
    await choose(/Choose an instance/, 'Initech Production (initech-prod)');
    await run();

    expect(await screen.findByText('instance "initech-prod" not found')).toBeInTheDocument();
  });

  it('says where the usage that is kept begins when the period of an instance began before', async () => {
    serve({
      answer: () =>
        refusal(422, {
          code: 'PreviewLicenseInvoice.OutsideRetention',
          detail: 'the usage history is kept from 2026-10-01T00:00:00.000Z',
          errors: [
            {
              location: 'retentionStart',
              message: 'retentionStart',
              value: '2026-10-01T00:00:00.000Z',
            },
          ],
        }),
    });
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: /An instance/ }));
    await choose(/Choose an instance/, 'Initech Production (initech-prod)');
    await run();

    expect(
      await screen.findByText(
        'The usage before Oct 1, 2026 (UTC) is no longer kept, and the period of this instance began earlier.',
      ),
    ).toBeInTheDocument();
  });

  it('shows any other refusal under the form', async () => {
    serve({
      answer: () =>
        refusal(404, {
          code: 'PreviewLicenseInvoice.PriceNotFound',
          detail: 'basePriceId nope is not a FLAT_FEE price of this version',
        }),
    });
    await openDialog();
    await run();

    expect(
      await screen.findByText('basePriceId nope is not a FLAT_FEE price of this version'),
    ).toBeInTheDocument();
    expect(problemUnderTheForm()).not.toBeNull();
  });
});
