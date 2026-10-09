import { describe, expect, it } from 'vite-plus/test';
import { MAX_DAYS_UNTIL_DUE, MAX_TRIAL_DAYS } from '@/domains/billing';
import {
  getSubscribeFormErrors,
  getTrialDays,
  initialSubscribeFormValues,
  SUBSCRIBE_REFUSAL_FIELDS,
  subscribeFormSchema,
  subscribeValuesToBody,
} from '../subscribe-instance.schema';

const NOW = new Date('2027-03-15T12:00:00.000Z');

const values = {
  ...initialSubscribeFormValues,
  basePriceId: 'price-monthly',
};

describe('what the subscribe dialog opens with', () => {
  it('asks for a price and nothing else: no terms of its own, and a start of now', () => {
    expect(initialSubscribeFormValues.basePriceId).toBe('');
    // An empty number reads as NaN in every number field of the console.
    expect(initialSubscribeFormValues.daysUntilDue).toBeNaN();
    expect(initialSubscribeFormValues.startAt).toBe('');
    // No trial until the license says one.
    expect(initialSubscribeFormValues.trialDays).toBe(0);
  });

  it('is complete as soon as a price is chosen, since the terms and the start are optional', () => {
    expect(subscribeFormSchema.safeParse(values).success).toBe(true);
    expect(getSubscribeFormErrors(values, { now: NOW })).toBeUndefined();
  });
});

describe('the payment terms of a contract', () => {
  it.each([0, 1, 45, MAX_DAYS_UNTIL_DUE])('accepts %i days', (days) => {
    expect(getSubscribeFormErrors({ ...values, daysUntilDue: days }, { now: NOW })).toBeUndefined();
  });

  it('accepts none, which is the terms of the organization', () => {
    expect(
      getSubscribeFormErrors({ ...values, daysUntilDue: Number.NaN }, { now: NOW }),
    ).toBeUndefined();
  });

  it.each([-1, 366, 2.5, Number.POSITIVE_INFINITY])(
    'refuses %s days, in the words of the form',
    (days) => {
      expect(
        getSubscribeFormErrors({ ...values, daysUntilDue: days }, { now: NOW }),
      ).toEqual({
        daysUntilDue:
          'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.daysUntilDue',
      });
    },
  );
});

describe('the trial', () => {
  it.each([0, 1, 14, MAX_TRIAL_DAYS])('accepts %i days', (days) => {
    expect(getSubscribeFormErrors({ ...values, trialDays: days }, { now: NOW })).toBeUndefined();
  });

  it('accepts none, which is no trial', () => {
    expect(
      getSubscribeFormErrors({ ...values, trialDays: Number.NaN }, { now: NOW }),
    ).toBeUndefined();
  });

  it.each([-1, MAX_TRIAL_DAYS + 1, 2.5, 2_147_483_647])(
    'refuses %s days, in the words of the form: the API sets no upper bound and the console sets one',
    (days) => {
      expect(
        getSubscribeFormErrors({ ...values, trialDays: days }, { now: NOW }),
      ).toEqual({
        trialDays:
          'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.trialDays',
      });
    },
  );

  it('is not asked for where no trial is offered, whatever the field still holds', () => {
    expect(
      getSubscribeFormErrors(
        { ...values, trialDays: 4_000 },
        { now: NOW, trialOffered: false },
      ),
    ).toBeUndefined();
  });
});

describe('the price', () => {
  it('has to be chosen', () => {
    expect(getSubscribeFormErrors({ ...values, basePriceId: '' }, { now: NOW })).toEqual({
      basePriceId:
        'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.basePrice',
    });
  });
});

describe('when billing starts', () => {
  it('is now when left empty', () => {
    expect(getSubscribeFormErrors({ ...values, startAt: '' }, { now: NOW, period: 'MONTHLY' })).toBeUndefined();
  });

  it('is read as UTC, and has to be a time', () => {
    expect(
      getSubscribeFormErrors({ ...values, startAt: 'yesterday' }, { now: NOW, period: 'MONTHLY' }),
    ).toEqual({
      startAt: 'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.startAt',
    });
  });

  it('may reach back one billing period, for a contract that began before it was entered', () => {
    expect(
      getSubscribeFormErrors({ ...values, startAt: '2027-02-15T12:00' }, { now: NOW, period: 'MONTHLY' }),
    ).toBeUndefined();
    expect(
      getSubscribeFormErrors({ ...values, startAt: '2026-03-15T12:00' }, { now: NOW, period: 'ANNUAL' }),
    ).toBeUndefined();
  });

  it('may not reach back further than the period of the price, which follows the price', () => {
    const startAt = '2027-01-15T12:00';

    expect(getSubscribeFormErrors({ ...values, startAt }, { now: NOW, period: 'MONTHLY' })).toEqual({
      startAt: 'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.startAtTooEarly',
    });
    // The same start is inside a quarter.
    expect(getSubscribeFormErrors({ ...values, startAt }, { now: NOW, period: 'QUARTERLY' })).toBeUndefined();
  });

  it('may not be in the future', () => {
    expect(
      getSubscribeFormErrors({ ...values, startAt: '2027-03-15T12:01' }, { now: NOW, period: 'MONTHLY' }),
    ).toEqual({
      startAt: 'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.startAtFuture',
    });
  });

  it('is left to the API when the price has no period to bound it by', () => {
    expect(
      getSubscribeFormErrors({ ...values, startAt: '2020-01-01T00:00' }, { now: NOW }),
    ).toBeUndefined();
  });
});

describe('the body of the subscription', () => {
  it('names NoOp and the price, and sends nothing the form left empty', () => {
    expect(subscribeValuesToBody(values)).toEqual({
      basePriceId: 'price-monthly',
      daysUntilDue: undefined,
      providerKind: 'NOOP',
      startAt: undefined,
    });
  });

  it('sends the terms and the start typed, the start as an instant', () => {
    expect(
      subscribeValuesToBody({ ...values, daysUntilDue: 45, startAt: '2027-03-01T10:30' }),
    ).toEqual({
      basePriceId: 'price-monthly',
      daysUntilDue: 45,
      providerKind: 'NOOP',
      startAt: '2027-03-01T10:30:00.000Z',
    });
  });

  it('sends zero days, which is a term, and not the absence of one', () => {
    expect(subscribeValuesToBody({ ...values, daysUntilDue: 0 }).daysUntilDue).toBe(0);
  });

  it('carries no collection method or voucher: this release takes none, and no add-on the person did not include', () => {
    const body = subscribeValuesToBody(
      { ...values, daysUntilDue: 10, startAt: '2027-03-01T00:00' },
      { trials: true },
    );

    for (const member of ['collectionMethod', 'addOns', 'voucherCode']) {
      expect(body, member).not.toHaveProperty(member);
    }
  });

  it('says nothing of trials to a release that has none', () => {
    expect(subscribeValuesToBody({ ...values, trialDays: 14 })).not.toHaveProperty(
      'trialDays',
    );
  });

  it('says the trial where the release has trials, zero days included, so that the license default does not apply behind it', () => {
    const advance = { billingTiming: 'ADVANCE' } as const;

    expect(
      subscribeValuesToBody({ ...values, trialDays: 14 }, { basePrice: advance, trials: true })
        .trialDays,
    ).toBe(14);
    expect(
      subscribeValuesToBody({ ...values, trialDays: 0 }, { basePrice: advance, trials: true })
        .trialDays,
    ).toBe(0);
    expect(
      subscribeValuesToBody(
        { ...values, trialDays: Number.NaN },
        { basePrice: advance, trials: true },
      ).trialDays,
    ).toBe(0);
  });

  it('starts a price billed in arrears with no trial, whatever the license says: the API cannot close such a trial', () => {
    expect(
      subscribeValuesToBody(
        { ...values, trialDays: 14 },
        { basePrice: { billingTiming: 'ARREARS' }, trials: true },
      ).trialDays,
    ).toBe(0);
    expect(getTrialDays({ trialDays: 14 }, { billingTiming: 'ARREARS' })).toBe(0);
  });
});

describe('the add-ons to start with', () => {
  const seats = { maxQuantity: 3, slug: 'extra-seats-v1' };
  const storage = { maxQuantity: undefined, slug: 'extra-storage-v1' };

  it('are none until the person includes one', () => {
    expect(initialSubscribeFormValues.addOns).toEqual({});
  });

  it('are sent with their units, in the order they were included, and only then', () => {
    expect(
      subscribeValuesToBody({
        ...values,
        addOns: { 'extra-storage-v1': 1, 'extra-seats-v1': 2 },
      }).addOns,
    ).toEqual([
      { addonSlug: 'extra-storage-v1', quantity: 1 },
      { addonSlug: 'extra-seats-v1', quantity: 2 },
    ]);
  });

  it('hold a whole number of units, at least one', () => {
    for (const units of [0, -1, 1.5, Number.NaN]) {
      expect(
        getSubscribeFormErrors(
          { ...values, addOns: { 'extra-seats-v1': units } },
          { addons: [seats], now: NOW },
        ),
        String(units),
      ).toMatchObject({
        addOns: 'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.addOns',
      });
    }
  });

  it('stay within the most each version allows, which only the offer knows', () => {
    const included = { ...values, addOns: { 'extra-seats-v1': 4, 'extra-storage-v1': 40 } };

    expect(getSubscribeFormErrors(included, { addons: [seats, storage], now: NOW })).toMatchObject({
      addOns: 'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.addOns',
    });
    expect(
      getSubscribeFormErrors(
        { ...values, addOns: { 'extra-seats-v1': 3, 'extra-storage-v1': 40 } },
        { addons: [seats, storage], now: NOW },
      ),
    ).toBeUndefined();
  });

  it('do not hold a form back when none is included', () => {
    expect(getSubscribeFormErrors(values, { addons: [seats], now: NOW })).toBeUndefined();
  });
});

describe('where a refusal of the API goes', () => {
  it('names the field each code is about, for the ones that do not locate it', () => {
    expect(SUBSCRIBE_REFUSAL_FIELDS.byCode).toEqual({
      'SubscribeInstance.InvalidDaysUntilDue': 'daysUntilDue',
      'SubscribeInstance.InvalidTrialDays': 'trialDays',
      'SubscribeInstance.PriceDeprecated': 'basePriceId',
      'SubscribeInstance.PriceNotFlatFee': 'basePriceId',
      'SubscribeInstance.PriceNotFound': 'basePriceId',
      'SubscribeInstance.PriceNotOnInstanceLicense': 'basePriceId',
      'SubscribeInstance.StartAtInFuture': 'startAt',
      'SubscribeInstance.StartAtTooEarly': 'startAt',
    });
  });
});
