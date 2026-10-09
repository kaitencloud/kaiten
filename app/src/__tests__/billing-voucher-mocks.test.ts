import { beforeEach, describe, expect, it } from 'vite-plus/test';
import type {
  EntitlementUsage,
  Invoice,
  InvoicePreview,
  Redemption,
  StartedSubscription,
  Validity,
  Voucher,
} from '@/api-client';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { server } from './msw-server';

// What the mocks standing in for the vouchers answer: the same refusals, with the same
// codes, in the order the API checks them (api/internal/modules/vouchers), and the same
// quirks the console must work around, because the console is tested against them. They
// are read off the wire, as the console does, over the world of `pnpm run dev:mock`: the
// vouchers in every state and what the instances redeemed of them.

const API = 'http://api.test/api';

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });

const json = async <T>(response: Response) => (await response.json()) as T;
const refusal = async (response: Response) =>
  json<{
    code?: string;
    detail?: string;
    errors?: Array<{
      location?: string;
      message?: string;
      value?: { code?: string; rule?: string };
    }>;
  }>(response);

const createVoucher = async (body: Record<string, unknown>) =>
  json<Voucher>(await send('POST', '/vouchers', body));

const percentOff = (overrides: Record<string, unknown> = {}) => ({
  duration: 'ONE_TIME',
  name: 'Ten percent',
  priceAppliesTo: 'LICENSE_BASE',
  priceDiscountType: 'PERCENTAGE',
  priceDiscountValue: '10',
  voucherType: 'PRICE',
  ...overrides,
});

const limitOf = async (instanceSlug: string, entitlementSlug: string) => {
  const usages = await json<EntitlementUsage[]>(
    await send('GET', `/instances/${instanceSlug}/entitlements/usage`),
  );

  return usages.find((usage) => usage.entitlementSlug === entitlementSlug)
    ?.limit;
};

beforeEach(() => {
  server.use(
    ...createMockHandlers(createDevMockConfig(), 'off', undefined, true),
    undeclaredApiRequest,
  );
});

describe('the vouchers, as the mocks serve them', () => {
  it('lists them newest first with their codes, and filters by status, type and customer', async () => {
    const all = await json<Voucher[]>(await send('GET', '/vouchers'));
    const byStatus = await json<Voucher[]>(
      await send('GET', '/vouchers?status=DRAFT'),
    );
    const boosts = await json<Voucher[]>(
      await send('GET', '/vouchers?voucherType=ENTITLEMENT_BOOST'),
    );
    const acme = await json<Voucher[]>(
      await send('GET', '/vouchers?restrictedCustomerSlug=acme-corp'),
    );

    expect(all.map(({ id }) => id)).toEqual([
      'voucher-summer-sale',
      'voucher-double-seats',
      'voucher-starter-bundle',
      'voucher-api-boost',
      'voucher-launch',
      'voucher-acme-agreement',
      'voucher-spring-promo',
      'voucher-black-friday',
    ]);
    expect(all.every(({ code }) => Boolean(code))).toBe(true);
    expect(byStatus.map(({ id }) => id)).toEqual(['voucher-summer-sale']);
    expect(boosts.map(({ id }) => id)).toEqual([
      'voucher-double-seats',
      'voucher-api-boost',
    ]);
    expect(acme.map(({ id }) => id)).toEqual(['voucher-acme-agreement']);
  });

  it('reads one by its id, and finds one by its code matched without case or separators', async () => {
    const one = await json<Voucher>(
      await send('GET', '/vouchers/voucher-launch'),
    );
    const found = await json<Voucher>(
      await send('POST', '/vouchers/lookup', { code: 'launch 20 off' }),
    );
    const missing = await send('GET', '/vouchers/ghost');
    const unknown = await send('POST', '/vouchers/lookup', { code: 'NOPE' });

    expect(one).toMatchObject({
      code: 'LAUNCH-20-OFF',
      codeHint: '0OFF',
      name: 'Launch discount',
      status: 'ACTIVE',
    });
    expect(found.id).toBe('voucher-launch');
    expect(missing.status).toBe(404);
    expect((await refusal(missing)).code).toBe('GetVoucher.NotFound');
    expect(unknown.status).toBe(404);
    expect((await refusal(unknown)).code).toBe('LookupVoucher.NotFound');
  });

  it('creates a draft with a generated code, and keeps the rest as it was given', async () => {
    const created = await createVoucher(
      percentOff({
        description: 'For the sales team',
        priceDiscountValue: '12.50',
      }),
    );

    expect(created).toMatchObject({
      codeHint: expect.stringMatching(/^[0-9A-Z]{4}$/),
      description: 'For the sales team',
      priceDiscountValue: '12.5',
      redemptionsCount: 0,
      status: 'DRAFT',
    });
    expect(created.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(
      (await json<Voucher[]>(await send('GET', '/vouchers')))[0].id,
    ).toBe(created.id);
  });

  it('refuses a draft for the reason the API gives, in the order it checks them', async () => {
    const code = async (body: Record<string, unknown>) => {
      const response = await send('POST', '/vouchers', body);

      return [response.status, (await refusal(response)).code];
    };

    expect(await code(percentOff({ code: 'short' }))).toEqual([
      422,
      'CreateVoucher.InvalidCode',
    ]);
    // The raw length counts, not the length without separators.
    expect(await code(percentOff({ code: 'SPRING2027' }))).toEqual([
      422,
      'CreateVoucher.WeakCodeUnbounded',
    ]);
    expect(
      (await send('POST', '/vouchers', percentOff({ code: 'AB-CD-EF-GH-JK' })))
        .status,
    ).toBe(201);
    expect(
      await code(percentOff({ duration: 'REPEATING' })),
    ).toEqual([422, 'CreateVoucher.InvalidDuration']);
    expect(
      await code(
        percentOff({
          expiresAt: '2026-01-01T00:00:00.000Z',
          startsAt: '2026-02-01T00:00:00.000Z',
        }),
      ),
    ).toEqual([422, 'CreateVoucher.InvalidWindow']);
    expect(await code(percentOff({ priceDiscountValue: '101' }))).toEqual([
      422,
      'CreateVoucher.InvalidDiscount',
    ]);
    expect(await code(percentOff({ priceDiscountValue: '0' }))).toEqual([
      422,
      'CreateVoucher.InvalidDiscount',
    ]);
    expect(
      await code(
        percentOff({ priceDiscountType: 'FIXED_AMOUNT', priceDiscountValue: '500' }),
      ),
    ).toEqual([422, 'CreateVoucher.CurrencyRequired']);
    expect(
      await code(
        percentOff({
          currency: 'ZZZ',
          priceDiscountType: 'FIXED_AMOUNT',
          priceDiscountValue: '500',
        }),
      ),
    ).toEqual([422, 'CreateVoucher.InvalidCurrency']);
    expect(await code(percentOff({ priceAppliesTo: 'SELECTED_PRICES' }))).toEqual(
      [422, 'CreateVoucher.SelectedPricesRequired'],
    );
    expect(
      await code(percentOff({ restrictedCustomerSlug: 'ghost' })),
    ).toEqual([404, 'CreateVoucher.CustomerNotFound']);
    expect(await code(percentOff({ code: 'launch-20-off' }))).toEqual([
      409,
      'CreateVoucher.CodeConflict',
    ]);
  });

  it('refuses a boost that has no grant, or one on an entitlement it cannot change', async () => {
    const boost = (grants: unknown) => ({
      duration: 'ONE_TIME',
      grants,
      name: 'Boost',
      voucherType: 'ENTITLEMENT_BOOST',
    });
    const code = async (body: Record<string, unknown>) =>
      (await refusal(await send('POST', '/vouchers', body))).code;

    expect(await code(boost([]))).toBe('CreateVoucher.GrantsRequired');
    expect(
      await code(
        boost([{ entitlementSlug: 'ghost', modifierType: 'UNLIMITED' }]),
      ),
    ).toBe('CreateVoucher.EntitlementNotFound');
    expect(
      await code(
        boost([{ entitlementSlug: 'advanced-analytics', modifierType: 'UNLIMITED' }]),
      ),
    ).toBe('CreateVoucher.BoostUnsupportedEntitlementType');
    expect(
      await code(
        boost([
          { entitlementSlug: 'seats', modifierType: 'MULTIPLY', modifierValue: '0' },
        ]),
      ),
    ).toBe('CreateVoucher.InvalidGrant');
    expect(
      await code(
        boost([
          { entitlementSlug: 'seats', modifierType: 'UNLIMITED', modifierValue: '2' },
        ]),
      ),
    ).toBe('CreateVoucher.InvalidGrant');
    expect(
      await code(
        boost([
          { entitlementSlug: 'seats', modifierType: 'SET', modifierValue: '0' },
          { entitlementSlug: 'seats', modifierType: 'ADD', modifierValue: '1' },
        ]),
      ),
    ).toBe('CreateVoucher.DuplicateGrant');
    expect(
      (
        await send(
          'POST',
          '/vouchers',
          boost([
            { entitlementSlug: 'seats', modifierType: 'SET', modifierValue: '0' },
          ]),
        )
      ).status,
    ).toBe(201);
  });

  it('publishes a draft once and archives from any state once', async () => {
    const published = await json<Voucher>(
      await send('POST', '/vouchers/voucher-summer-sale/publish'),
    );
    const again = await send('POST', '/vouchers/voucher-summer-sale/publish');
    const archived = await json<Voucher>(
      await send('POST', '/vouchers/voucher-summer-sale/archive'),
    );
    const archivedAgain = await send(
      'POST',
      '/vouchers/voucher-summer-sale/archive',
    );

    expect(published.status).toBe('ACTIVE');
    expect(again.status).toBe(409);
    expect((await refusal(again)).code).toBe('PublishVoucher.NotADraft');
    expect(archived.status).toBe('ARCHIVED');
    expect(archivedAgain.status).toBe(409);
    expect((await refusal(archivedAgain)).code).toBe(
      'ArchiveVoucher.AlreadyArchived',
    );
  });

  it('replaces a draft in full but its type', async () => {
    const draft = await json<Voucher>(
      await send('GET', '/vouchers/voucher-summer-sale'),
    );
    const updated = await json<Voucher>(
      await send('PUT', '/vouchers/voucher-summer-sale', {
        ...percentOff({ code: draft.code, name: 'Winter sale' }),
        priceDiscountValue: '30',
      }),
    );
    const retyped = await send('PUT', '/vouchers/voucher-summer-sale', {
      duration: 'ONE_TIME',
      grants: [
        { entitlementSlug: 'seats', modifierType: 'UNLIMITED' },
      ],
      name: 'Boost',
      voucherType: 'ENTITLEMENT_BOOST',
    });

    expect(updated).toMatchObject({
      code: draft.code,
      name: 'Winter sale',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '30',
      status: 'DRAFT',
    });
    expect(retyped.status).toBe(409);
    expect((await refusal(retyped)).code).toBe('UpdateVoucher.NotEditable');
  });

  it('takes four members of an active voucher, below which the count cannot go, and clears what it is not given', async () => {
    const launch = await json<Voucher>(
      await send('GET', '/vouchers/voucher-launch'),
    );
    const body = (overrides: Record<string, unknown> = {}) => ({
      code: launch.code,
      description: launch.description,
      duration: launch.duration,
      durationInPeriods: launch.durationInPeriods,
      expiresAt: launch.expiresAt,
      maxRedemptions: launch.maxRedemptions,
      name: launch.name,
      priceAppliesTo: launch.priceAppliesTo,
      priceDiscountType: launch.priceDiscountType,
      priceDiscountValue: launch.priceDiscountValue,
      redemptionRules: launch.redemptionRules,
      voucherType: launch.voucherType,
      ...overrides,
    });

    const renamed = await json<Voucher>(
      await send(
        'PUT',
        '/vouchers/voucher-launch',
        body({ maxRedemptions: 150, name: 'Launch discount 2' }),
      ),
    );
    const changedDiscount = await send(
      'PUT',
      '/vouchers/voucher-launch',
      body({ priceDiscountValue: '25' }),
    );
    const belowCount = await send(
      'PUT',
      '/vouchers/voucher-launch',
      body({ maxRedemptions: 1 }),
    );
    const noStart = await send(
      'PUT',
      '/vouchers/voucher-launch',
      body({ startsAt: '2026-01-01T00:00:00.000Z' }),
    );
    // What it is not given, it clears: the description, the limit and the end.
    const bare = await json<Voucher>(
      await send(
        'PUT',
        '/vouchers/voucher-launch',
        body({
          description: undefined,
          expiresAt: undefined,
          maxRedemptions: undefined,
        }),
      ),
    );

    expect(renamed).toMatchObject({
      maxRedemptions: 150,
      name: 'Launch discount 2',
      status: 'ACTIVE',
    });
    expect(changedDiscount.status).toBe(409);
    expect((await refusal(changedDiscount)).code).toBe(
      'UpdateVoucher.NotEditable',
    );
    expect((await refusal(belowCount)).code).toBe(
      'UpdateVoucher.MaxRedemptionsBelowCount',
    );
    expect((await refusal(noStart)).code).toBe('UpdateVoucher.NotEditable');
    expect(bare.description).toBeUndefined();
    expect(bare.expiresAt).toBeUndefined();
    expect(bare.maxRedemptions).toBeUndefined();
  });

  it('does not rewrite the grants of an active boost, nor keep the minimum amount it is not given', async () => {
    const boost = await json<Voucher>(
      await send('GET', '/vouchers/voucher-api-boost'),
    );
    const sameBody = {
      code: boost.code,
      duration: boost.duration,
      durationInPeriods: boost.durationInPeriods,
      grants: [{ ...boost.grants[0], modifierValue: '99' }],
      maxRedemptions: boost.maxRedemptions,
      name: boost.name,
      voucherType: boost.voucherType,
    };
    const updated = await json<Voucher>(
      await send('PUT', '/vouchers/voucher-api-boost', sameBody),
    );

    // The API answers 200 and keeps the grant it had.
    expect(updated.grants).toEqual(boost.grants);

    const guarded = await createVoucher(
      percentOff({
        redemptionRules: {
          minimumSubscriptionAmount: { currency: 'USD', unitAmountDecimal: '2900' },
        },
      }),
    );
    await send('POST', `/vouchers/${guarded.id}/publish`);
    const rewritten = await json<Voucher>(
      await send('PUT', `/vouchers/${guarded.id}`, {
        ...percentOff({ code: guarded.code }),
        name: 'Renamed',
      }),
    );

    expect(rewritten.name).toBe('Renamed');
    expect(rewritten.redemptionRules).toEqual({});
  });

  it('refuses to change a voucher that is neither a draft nor active', async () => {
    const archived = await send('PUT', '/vouchers/voucher-black-friday', {
      ...percentOff({ code: 'BLACKFRIDAY2025', maxRedemptions: 50 }),
      name: 'Black Friday 2026',
    });
    const exhausted = await send('PUT', '/vouchers/voucher-acme-agreement', {
      duration: 'REPEATING',
      durationInPeriods: 2,
      name: 'Acme',
      voucherType: 'PRICE',
    });

    expect(archived.status).toBe(409);
    expect((await refusal(archived)).code).toBe('UpdateVoucher.NotEditable');
    expect(exhausted.status).toBe(409);
    expect((await refusal(exhausted)).code).toBe('UpdateVoucher.NotEditable');
  });
});

describe('validating and redeeming a code, as the mocks serve it', () => {
  const validate = async (code: string, instanceSlug?: string) =>
    json<Validity>(await send('POST', '/vouchers/validate', { code, instanceSlug }));

  it('says why a code would not redeem, with the voucher but never its code', async () => {
    const draft = await validate('SUMMER-SALE-2026');
    const lapsed = await validate('SPRING-2026-PROMO');
    const used = await validate('ACME-ENTERPRISE-2026');
    const unknown = await validate('GHOST-CODE');
    const fine = await validate('LAUNCH-20-OFF', 'gamma-production');

    expect(draft).toMatchObject({ reason: 'NOT_ACTIVE', valid: false });
    expect(lapsed).toMatchObject({ reason: 'EXPIRED', valid: false });
    expect(used).toMatchObject({ reason: 'EXHAUSTED', valid: false });
    expect(unknown).toEqual({ reason: 'NOT_FOUND', valid: false });
    expect(fine.valid).toBe(true);
    expect(fine.voucher?.id).toBe('voucher-launch');
    expect(fine.voucher?.code).toBeUndefined();
    expect(draft.voucher?.code).toBeUndefined();
  });

  it('judges the instance by the rules of the voucher, in the order of the API', async () => {
    const reasons = {
      alreadyRedeemed: await validate('LAUNCH-20-OFF', 'globex-staging'),
      license: await validate('STARTER-BUNDLE-25', 'acme-production'),
      restricted: await validate('DOUBLE-SEATS-GLOBEX', 'acme-production'),
    };
    const missing = await send('POST', '/vouchers/validate', {
      code: 'LAUNCH-20-OFF',
      instanceSlug: 'ghost',
    });

    expect(reasons.alreadyRedeemed).toMatchObject({
      reason: 'ALREADY_REDEEMED',
      valid: false,
    });
    expect(reasons.license).toMatchObject({
      reason: 'NOT_ELIGIBLE',
      rule: 'LICENSE_NOT_APPLICABLE',
    });
    expect(reasons.restricted).toMatchObject({
      reason: 'NOT_ELIGIBLE',
      rule: 'RESTRICTED_CUSTOMER',
    });
    expect(missing.status).toBe(404);
    expect((await refusal(missing)).code).toBe('ValidateVoucher.InstanceNotFound');
  });

  it('checks the rules that read the subscription: annual only, the minimum amount, the currency', async () => {
    const annual = await createVoucher(
      percentOff({ code: 'ANNUAL-ONLY-15', redemptionRules: { annualOnly: true } }),
    );
    const minimum = await createVoucher(
      percentOff({
        code: 'MINIMUM-AMOUNT-30',
        redemptionRules: {
          minimumSubscriptionAmount: { currency: 'USD', unitAmountDecimal: '5000000' },
        },
      }),
    );
    const euros = await createVoucher({
      code: 'EURO-CREDIT-25',
      currency: 'EUR',
      duration: 'ONE_TIME',
      name: 'Euros',
      priceAppliesTo: 'BOTH',
      priceDiscountType: 'FIXED_AMOUNT',
      priceDiscountValue: '2500',
      voucherType: 'PRICE',
    });
    for (const voucher of [annual, minimum, euros]) {
      await send('POST', `/vouchers/${voucher.id}/publish`);
    }

    // Globex Production pays by the month, a base price of $99.
    expect(await validate('ANNUAL-ONLY-15', 'globex-production')).toMatchObject({
      reason: 'NOT_ELIGIBLE',
      rule: 'ANNUAL_ONLY',
    });
    // Acme Production pays a year at a time.
    expect((await validate('ANNUAL-ONLY-15', 'acme-production')).valid).toBe(true);
    expect(await validate('MINIMUM-AMOUNT-30', 'globex-production')).toMatchObject({
      reason: 'NOT_ELIGIBLE',
      rule: 'MINIMUM_SUBSCRIPTION_AMOUNT',
    });
    expect(await validate('EURO-CREDIT-25', 'globex-production')).toMatchObject({
      reason: 'CURRENCY_MISMATCH',
    });
    // An instance nobody bills has no subscription to disagree with.
    expect((await validate('EURO-CREDIT-25', 'gamma-production')).valid).toBe(true);
  });

  describe('against the price a subscription would start on', () => {
    // Gamma Production runs Starter 2026 and was never subscribed: its version sells a
    // flat fee by the month and one by the year, in dollars.
    const priceOf = async (period: 'ANNUAL' | 'MONTHLY') => {
      const prices = await json<Array<{ billingPeriod?: string; id: string }>>(
        await send('GET', '/licenses/starter-v2/prices'),
      );

      return prices.find((price) => price.billingPeriod === period)?.id ?? '';
    };
    const check = async (
      code: string,
      licensePriceId: string,
      instanceSlug = 'gamma-production',
    ) =>
      json<Validity>(
        await send('POST', '/vouchers/validate', {
          code,
          instanceSlug,
          licensePriceId,
        }),
      );

    it('reads the period, the amount and the currency of the price, and not the subscription of the instance', async () => {
      const annual = await createVoucher(
        percentOff({ code: 'ANNUAL-ONLY-15', redemptionRules: { annualOnly: true } }),
      );
      const minimum = await createVoucher(
        percentOff({
          code: 'MINIMUM-AMOUNT-30',
          redemptionRules: {
            minimumSubscriptionAmount: { currency: 'USD', unitAmountDecimal: '5000000' },
          },
        }),
      );
      const euros = await createVoucher({
        code: 'EURO-CREDIT-25',
        currency: 'EUR',
        duration: 'ONE_TIME',
        name: 'Euros',
        priceAppliesTo: 'BOTH',
        priceDiscountType: 'FIXED_AMOUNT',
        priceDiscountValue: '2500',
        voucherType: 'PRICE',
      });
      for (const voucher of [annual, minimum, euros]) {
        await send('POST', `/vouchers/${voucher.id}/publish`);
      }
      const monthly = await priceOf('MONTHLY');
      const yearly = await priceOf('ANNUAL');

      expect(await check('ANNUAL-ONLY-15', monthly)).toMatchObject({
        reason: 'NOT_ELIGIBLE',
        rule: 'ANNUAL_ONLY',
      });
      expect((await check('ANNUAL-ONLY-15', yearly)).valid).toBe(true);
      // $290.00 a year is under the $50,000.00 floor.
      expect(await check('MINIMUM-AMOUNT-30', yearly)).toMatchObject({
        reason: 'NOT_ELIGIBLE',
        rule: 'MINIMUM_SUBSCRIPTION_AMOUNT',
      });
      expect(await check('EURO-CREDIT-25', monthly)).toMatchObject({
        reason: 'CURRENCY_MISMATCH',
      });
      // The same instance, with no price: nothing to disagree with.
      expect((await validate('EURO-CREDIT-25', 'gamma-production')).valid).toBe(true);
    });

    it('judges the version the price belongs to, which the subscription would move the instance to', async () => {
      const monthly = await priceOf('MONTHLY');

      // Acme Production runs Enterprise, and the bundle is for Starter.
      expect(await validate('STARTER-BUNDLE-25', 'acme-production')).toMatchObject({
        reason: 'NOT_ELIGIBLE',
        rule: 'LICENSE_NOT_APPLICABLE',
      });
      expect((await check('STARTER-BUNDLE-25', monthly, 'acme-production')).valid).toBe(true);
    });

    it('still runs the checks that need the instance, and says what an unknown code is', async () => {
      const monthly = await priceOf('MONTHLY');

      expect(await check('DOUBLE-SEATS-GLOBEX', monthly, 'acme-production')).toMatchObject({
        reason: 'NOT_ELIGIBLE',
        rule: 'RESTRICTED_CUSTOMER',
      });
      expect(await check('GHOST-CODE', monthly)).toEqual({
        reason: 'NOT_FOUND',
        valid: false,
      });
    });

    it('refuses a price that is no flat fee of the organization, with the code of the API', async () => {
      const prices = await json<Array<{ billingModel: string; id: string }>>(
        await send('GET', '/licenses/business/prices'),
      );
      const metered = prices.find((price) => price.billingModel === 'OVERAGE');
      const unknown = await send('POST', '/vouchers/validate', {
        code: 'LAUNCH-20-OFF',
        instanceSlug: 'gamma-production',
        licensePriceId: '00000000-0000-4000-8000-000000000000',
      });
      const notFlat = await send('POST', '/vouchers/validate', {
        code: 'LAUNCH-20-OFF',
        instanceSlug: 'gamma-production',
        licensePriceId: metered?.id,
      });

      expect(unknown.status).toBe(404);
      expect((await refusal(unknown)).code).toBe('ValidateVoucher.PriceNotFound');
      expect(notFlat.status).toBe(404);
      expect((await refusal(notFlat)).code).toBe('ValidateVoucher.PriceNotFound');
    });
  });

  it('redeems a discount: the voucher counts it, and the next invoice carries the discount', async () => {
    const response = await send('POST', '/instances/gamma-production/vouchers/redeem', {
      code: 'launch-20-off',
    });
    const redemption = await json<Redemption>(response);
    const voucher = await json<Voucher>(
      await send('GET', '/vouchers/voucher-launch'),
    );
    const listed = await json<Redemption[]>(
      await send('GET', '/instances/gamma-production/vouchers'),
    );
    const byVoucher = await json<Redemption[]>(
      await send('GET', '/vouchers/voucher-launch/redemptions'),
    );

    expect(response.status).toBe(201);
    expect(redemption).toMatchObject({
      applicationsCount: 0,
      applicationsMax: 3,
      codeHint: '0OFF',
      instanceSlug: 'gamma-production',
      status: 'ACTIVE',
      voucherId: 'voucher-launch',
      voucherType: 'PRICE',
    });
    expect(redemption.effectiveExpiresAt).toBeUndefined();
    expect(voucher.redemptionsCount).toBe(3);
    expect(listed.map(({ id }) => id)).toEqual([redemption.id]);
    expect(byVoucher).toHaveLength(3);
    expect(byVoucher[0].id).toBe(redemption.id);
  });

  it('puts the discount on the invoice the next boundary issues, whatever composed it', async () => {
    const before = await json<InvoicePreview>(
      await send('GET', '/instances/globex-staging/billing/upcoming-invoice'),
    );

    // Globex Staging redeemed the launch discount after its last renewal: the 20 %
    // of its base price is on the invoice it will issue.
    const discount = before.lines.find((line) => line.type === 'DISCOUNT');

    expect(discount).toMatchObject({
      amount: -580,
      instanceVoucherId: 'redemption-globex-staging-launch',
      voucherId: 'voucher-launch',
    });
    expect(discount?.discount).toMatchObject({
      application: 1,
      applicationsMax: 3,
      appliesTo: 'LICENSE_BASE',
      base: '2900',
      discountType: 'PERCENTAGE',
      discountValue: '20',
      targetSeqs: [2],
    });
    expect(discount?.discount?.allocations).toEqual([{ amount: 580, targetSeq: 2 }]);
    expect(before.discountTotal).toBe(580);
    expect(before.total).toBe(before.subtotal - 580);
  });

  it('redeems a boost for the periods of the subscription, and the instance reads its effective limit at once', async () => {
    const limitBefore = await limitOf('globex-production', 'seats');
    const response = await send('POST', '/instances/globex-production/vouchers/redeem', {
      code: 'DOUBLE-SEATS-GLOBEX',
    });
    const redemption = await json<Redemption>(response);

    expect(response.status).toBe(201);
    // Six monthly periods from the redemption.
    const months =
      (Date.parse(redemption.effectiveExpiresAt ?? '') -
        Date.parse(redemption.redeemedAt)) /
      (30 * 24 * 60 * 60 * 1000);
    expect(months).toBeGreaterThan(5.8);
    expect(months).toBeLessThan(6.2);
    const limitAfter = await limitOf('globex-production', 'seats');
    expect(limitAfter).toEqual({
      type: 'number',
      value: (limitBefore?.type === 'number' ? Number(limitBefore.value) : 0) * 2,
    });
  });

  it('shows the boost an instance already has in its effective limit', async () => {
    const calls = await limitOf('globex-production', 'api-calls');

    // The Business license grants 100,000 calls and the boost adds 50,000.
    expect(calls).toEqual({ type: 'number', value: 150_000 });
  });

  it('stops at the last redemption: the voucher is then exhausted', async () => {
    const created = await createVoucher(percentOff({ code: 'ONLY-ONE-2027', maxRedemptions: 1 }));
    await send('POST', `/vouchers/${created.id}/publish`);

    const first = await send('POST', '/instances/gamma-production/vouchers/redeem', {
      code: 'ONLY-ONE-2027',
    });
    const exhausted = await json<Voucher>(await send('GET', `/vouchers/${created.id}`));
    const second = await send('POST', '/instances/beta-staging/vouchers/redeem', {
      code: 'ONLY-ONE-2027',
    });

    expect(first.status).toBe(201);
    expect(exhausted.status).toBe('EXHAUSTED');
    expect(second.status).toBe(422);
    expect((await refusal(second)).code).toBe('RedeemVoucher.Exhausted');
  });

  it('refuses a redemption for the reason of the first check it fails, with the rule of an ineligible one', async () => {
    const redeem = async (code: string, instanceSlug = 'gamma-production') =>
      send('POST', `/instances/${instanceSlug}/vouchers/redeem`, { code });

    const unknown = await redeem('GHOST-CODE');
    const noInstance = await redeem('LAUNCH-20-OFF', 'ghost');
    const draft = await redeem('SUMMER-SALE-2026');
    const lapsed = await redeem('SPRING-2026-PROMO');
    const exhausted = await redeem('ACME-ENTERPRISE-2026');
    const restricted = await redeem('DOUBLE-SEATS-GLOBEX');
    const again = await redeem('LAUNCH-20-OFF', 'globex-staging');

    expect([unknown.status, (await refusal(unknown)).code]).toEqual([
      404,
      'RedeemVoucher.NotFound',
    ]);
    expect([noInstance.status, (await refusal(noInstance)).code]).toEqual([
      404,
      'RedeemVoucher.InstanceNotFound',
    ]);
    expect((await refusal(draft)).code).toBe('RedeemVoucher.NotActive');
    expect((await refusal(lapsed)).code).toBe('RedeemVoucher.Expired');
    expect((await refusal(exhausted)).code).toBe('RedeemVoucher.Exhausted');
    expect(restricted.status).toBe(422);
    const ineligible = await refusal(restricted);
    expect(ineligible.code).toBe('RedeemVoucher.NotEligible');
    expect(ineligible.errors?.[0]?.value?.rule).toBe('RESTRICTED_CUSTOMER');
    expect([again.status, (await refusal(again)).code]).toEqual([
      409,
      'RedeemVoucher.AlreadyRedeemed',
    ]);
  });

  it('revokes a redemption with a reason, and the boost ends at once', async () => {
    const reasonless = await send(
      'POST',
      '/instances/globex-production/vouchers/redemption-globex-production-boost/revoke',
      { reason: '  ' },
    );
    const strange = await send(
      'POST',
      '/instances/globex-production/vouchers/ghost/revoke',
      { reason: 'No reason' },
    );
    const revoked = await json<Redemption>(
      await send(
        'POST',
        '/instances/globex-production/vouchers/redemption-globex-production-boost/revoke',
        { reason: 'Contract terminated early' },
      ),
    );
    const again = await send(
      'POST',
      '/instances/globex-production/vouchers/redemption-globex-production-boost/revoke',
      { reason: 'Twice' },
    );
    const voucher = await json<Voucher>(
      await send('GET', '/vouchers/voucher-api-boost'),
    );

    expect((await refusal(reasonless)).code).toBe(
      'RevokeInstanceVoucher.ReasonRequired',
    );
    expect(reasonless.status).toBe(422);
    expect(strange.status).toBe(404);
    expect(revoked).toMatchObject({
      revokedReason: 'Contract terminated early',
      status: 'REVOKED',
    });
    expect(revoked.revokedAt).toBeDefined();
    expect(again.status).toBe(409);
    expect((await refusal(again)).code).toBe('RevokeInstanceVoucher.NotActive');
    // The count is not given back.
    expect(voucher.redemptionsCount).toBe(1);
    expect(await limitOf('globex-production', 'api-calls')).toEqual({
      type: 'number',
      value: 100_000,
    });
  });
});

describe('subscribing with a code, as the mocks serve it', () => {
  const subscribe = (body: Record<string, unknown>) =>
    send('POST', '/instances/gamma-production/billing', {
      basePriceId: 'license-starter-v2-monthly',
      trialDays: 0,
      ...body,
    });

  it('redeems the code with the subscription and discounts its first invoice', async () => {
    const response = await subscribe({ voucherCode: 'LAUNCH-20-OFF' });
    const started = await json<StartedSubscription>(response);
    const invoice = await json<Invoice>(
      await send('GET', `/invoices/${started.activationInvoice?.id}`),
    );
    const redemptions = await json<Redemption[]>(
      await send('GET', '/instances/gamma-production/vouchers'),
    );

    expect(response.status).toBe(201);
    expect(invoice.lines.map(({ type }) => type)).toEqual(['BASE', 'DISCOUNT']);
    const discount = invoice.lines[1];
    expect(discount.amount).toBe(-Math.round(Number(invoice.lines[0].amount) * 0.2));
    expect(invoice.discountTotal).toBe(-discount.amount);
    expect(invoice.total).toBe(invoice.subtotal - invoice.discountTotal);
    expect(discount.discount).toMatchObject({ application: 1, discountValue: '20' });
    expect(redemptions).toHaveLength(1);
    // The invoice used one of the three invoices the redemption discounts.
    expect(redemptions[0].applicationsCount).toBe(1);
  });

  it('refuses the whole subscription when the code cannot be redeemed, and says why on the member', async () => {
    const response = await subscribe({ voucherCode: 'SPRING-2026-PROMO' });
    const problem = await refusal(response);
    const billing = await send('GET', '/instances/gamma-production/billing');

    expect(response.status).toBe(422);
    expect(problem.code).toBe('SubscribeInstance.VoucherInvalid');
    expect(problem.errors?.[0]).toMatchObject({
      location: 'body.voucherCode',
      message: 'the voucher has expired',
      value: { code: 'RedeemVoucher.Expired' },
    });
    // Nothing was written.
    expect(billing.status).toBe(404);
  });

  it('checks the rules that read the subscription against the one being started', async () => {
    const annual = await createVoucher(
      percentOff({ code: 'ANNUAL-ONLY-15', redemptionRules: { annualOnly: true } }),
    );
    await send('POST', `/vouchers/${annual.id}/publish`);

    const monthly = await subscribe({ voucherCode: 'ANNUAL-ONLY-15' });

    expect(monthly.status).toBe(422);
    expect((await refusal(monthly)).errors?.[0]?.value?.code).toBe(
      'RedeemVoucher.NotEligible',
    );
  });
});

describe('the invoices of the dev world', () => {
  it('carries the discount of an agreement on the first invoice of Acme Production', async () => {
    const invoice = await json<Invoice>(
      await send('GET', '/invoices/inv-acme-production-activation'),
    );
    const discount = invoice.lines.find((line) => line.type === 'DISCOUNT');

    expect(discount).toMatchObject({
      amount: -480_000,
      instanceVoucherId: 'redemption-acme-production-agreement',
      voucherId: 'voucher-acme-agreement',
    });
    expect(invoice.discountTotal).toBe(480_000);
    expect(invoice.total).toBe(invoice.subtotal - 480_000);
  });
});
